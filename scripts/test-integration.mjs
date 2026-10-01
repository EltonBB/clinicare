import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { requireTestDatabaseUrl, requireTestSchema } from '../tests/integration/database-safety.mjs';

// Validate before creating a pool or launching a tool that could load .env.
const connectionString = requireTestDatabaseUrl(process.env.VELA_TEST_DATABASE_URL);
const schema = requireTestSchema(`vela_test_${randomUUID().replaceAll('-', '')}`);
const schemaUrl = new URL(connectionString);
schemaUrl.searchParams.set('schema', schema);
const root = fileURLToPath(new URL('../', import.meta.url));
const pool = new pg.Pool({ connectionString, ssl: false, max: 1, connectionTimeoutMillis: 5000 });
const childEnv = {
  ...process.env,
  DATABASE_URL: schemaUrl.toString(),
  DIRECT_URL: schemaUrl.toString(),
  VELA_TEST_DATABASE_URL: connectionString,
  VELA_TEST_SCHEMA: schema,
};

/** @param {string} tool @param {string[]} args */
function run(tool, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tool, ...args], {
      cwd: root, env: childEnv, stdio: 'inherit', shell: false,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`Integration command failed (exit ${code}).`));
    });
  });
}

let created = false;
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  await run('node_modules/prisma/build/index.js', ['db', 'push', '--skip-generate']);
  await run('node_modules/vitest/vitest.mjs', ['run', '--config', 'vitest.integration.config.ts']);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Integration verification failed.');
  process.exitCode = 1;
} finally {
  try {
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  } finally {
    await pool.end();
  }
}
