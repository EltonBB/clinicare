/* Disposable PostgreSQL QA only. No .env files are loaded and no existing DB is reused. */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const binaryRoot = process.env.QA_POSTGRES_BINARY_ROOT;
const port = 55432;

async function run(executable, args, env, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: project, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options,
    });
    const timeout = setTimeout(() => child.kill(), 300_000);
    timeout.unref();
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(output);
      else reject(new Error(`QA process exited ${code}`));
    });
  });
}

async function main() {
  if (!binaryRoot || process.platform !== "win32") {
    throw new Error("Set QA_POSTGRES_BINARY_ROOT to an isolated Windows portable PostgreSQL bin directory.");
  }
  // Prisma CLI can automatically read .env. Require a sanitized source snapshot,
  // rather than relying on explicit DATABASE_URL taking precedence over a file.
  for (const directory of [project, path.join(project, "prisma")]) {
    if ((await fs.readdir(directory)).some((name) => {
      const normalized = name.toLowerCase();
      return (normalized === ".env" || normalized.startsWith(".env.")) && !normalized.endsWith(".example");
    })) {
      throw new Error("Use a sanitized source snapshot without .env files for disposable QA.");
    }
  }
  const binaries = await fs.realpath(binaryRoot);
  const qaParent = path.join(project, ".qa-postgres");
  await fs.mkdir(qaParent, { recursive: true });
  if (await fs.realpath(qaParent) !== path.join(await fs.realpath(project), ".qa-postgres")) {
    throw new Error("Refusing a database parent redirected outside the QA project.");
  }
  const runDir = await fs.mkdtemp(path.join(qaParent, "mobile-"));
  const dataDir = path.join(runDir, "data");
  const resolvedRunDir = await fs.realpath(runDir);
  if (path.dirname(resolvedRunDir) !== await fs.realpath(qaParent) || await fs.stat(dataDir).catch(() => null)) {
    throw new Error("Refusing a reused or unexpected database path.");
  }
  console.log(`Disposable fictional-data cluster: ${dataDir}`);
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  const password = crypto.randomBytes(24).toString("hex");
  const passwordFile = path.join(runDir, "bootstrap-password");
  const databaseUrl = `postgresql://vela_qa:${password}@127.0.0.1:${port}/vela_mobile_qa`;
  // An allowlist prevents inherited clinic/provider credentials from reaching children.
  const env = Object.fromEntries(
    ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA"]
      .filter((key) => process.env[key]).map((key) => [key, process.env[key]])
  );
  Object.assign(env, {
    NODE_ENV: "test", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    VELA_QA_DATABASE_URL: databaseUrl, VELA_QA_FRESH_CLUSTER: "1",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "qa-unused",
  });
  const pgCtl = path.join(binaries, "pg_ctl.exe");
  let started = false;
  let monitor, monitoring, monitoringError, stopMonitoring = false;
  const diagnostics = process.env.QA_PG_DIAGNOSTICS === "1";
  try {
    await fs.writeFile(passwordFile, password, { flag: "wx" });
    await run(path.join(binaries, "initdb.exe"), ["-D", dataDir, "-U", "vela_qa", `--pwfile=${passwordFile}`, "--auth=scram-sha-256", "--no-locale", "--no-sync", "-E", "UTF8"], env);
    await fs.unlink(passwordFile);
    await run(pgCtl, ["-D", dataDir, "-l", path.join(runDir, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1${diagnostics ? " -c log_min_duration_statement=0 -c log_parameter_max_length=0" : ""}`, "-w", "start"], env);
    started = true;
    const client = new Client({ connectionString: databaseUrl.replace("/vela_mobile_qa", "/postgres"), ssl: false, connectionTimeoutMillis: 10_000 });
    try {
      await client.connect();
      const info = await client.query("SELECT version(), host(inet_server_addr()) AS address, inet_server_port() AS port");
      if (info.rows[0].address !== "127.0.0.1" || info.rows[0].port !== port) throw new Error("Unexpected PostgreSQL listener.");
      console.log(JSON.stringify({ postgres: info.rows[0] }));
      await client.query('CREATE DATABASE "vela_mobile_qa"');
    } finally {
      await client.end();
    }
    await run(process.execPath, [path.join(project, "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--schema", path.join(project, "prisma/schema.prisma")], env);
    if (diagnostics) {
      monitor = new Client({ connectionString: databaseUrl.replace("/vela_mobile_qa", "/postgres"), ssl: false });
      await monitor.connect();
      const samples = [];
      monitoring = (async () => {
        while (!stopMonitoring) {
          const startedAt = Date.now();
          const result = await monitor.query(`SELECT pid, state, wait_event_type, wait_event,
            EXTRACT(EPOCH FROM (clock_timestamp()-xact_start))*1000 AS transaction_ms,
            pg_blocking_pids(pid) AS blockers
            FROM pg_stat_activity WHERE datname='vela_mobile_qa' AND pid<>pg_backend_pid()`);
          samples.push({ at: new Date().toISOString(), probeMs: Date.now()-startedAt, connections: result.rows });
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        await fs.writeFile(path.join(runDir, "pg-waits.json"), JSON.stringify(samples, null, 2));
      })().catch(error => { monitoringError = error; });
    }
    await run(process.execPath, [path.join(project, "node_modules/vitest/vitest.mjs"), "run", "--config", "qa/mobile-api.integration.config.mts", "--reporter=verbose", "--reporter=json", `--outputFile.json=${path.join(runDir, "results.json")}`], env);
    console.log(`QA evidence saved: ${path.join(runDir, "results.json")}`);
  } finally {
    stopMonitoring = true;
    const cleanupErrors = [];
    // A diagnostic failure must never skip shutdown of the owned database.
    if (monitoring) await monitoring.catch(error => cleanupErrors.push(error));
    if (monitoringError) cleanupErrors.push(monitoringError);
    if (monitor) await monitor.end().catch(error => cleanupErrors.push(error));
    await fs.unlink(passwordFile).catch(() => {});
    if (started) await run(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "stop"], env).catch(error => cleanupErrors.push(error));
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Disposable PostgreSQL cleanup failed; inspect the owned run directory.");
    console.log("Disposable PostgreSQL stopped. Fictional files remain locally for inspection.");
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
