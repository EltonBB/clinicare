import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workerRequire = createRequire(new URL('../services/whatsapp-worker/package.json', import.meta.url));
const expressRequire = createRequire(workerRequire.resolve('express'));
const baileysRequire = createRequire(workerRequire.resolve('baileys'));
const configRequire = createRequire(workerRequire.resolve('@prisma/config'));
const proxyEntry = expressRequire.resolve('proxy-addr');
const metadataEntry = baileysRequire.resolve('music-metadata');
const mergeEntry = configRequire.resolve('deepmerge-ts');

function installedPackage(entry, name) {
  for (let directory = path.dirname(entry); ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, 'package.json');
    if (existsSync(manifest)) {
      const info = JSON.parse(readFileSync(manifest, 'utf8'));
      if (info.name === name) return info;
    }
    assert.notEqual(directory, path.dirname(directory), `Cannot find installed ${name} manifest`);
  }
}

// Never feed crafted files or cyclic records to the old vulnerable installation.
for (const [entry, name, version] of [
  [proxyEntry, 'proxy-addr', '2.0.8'],
  [metadataEntry, 'music-metadata', '11.16.0'],
  [mergeEntry, 'deepmerge-ts', '8.0.2'],
]) {
  assert.equal(installedPackage(entry, name).version, version,
    `Install the reviewed worker lock before running ${name} security regressions`);
}

if (!process.argv.includes('--consumer')) {
  // An external deadline also contains a synchronous parser or graph-merging regression.
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--consumer'], {
    timeout: 15_000, encoding: 'utf8', maxBuffer: 1_000_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || 'Worker dependency regression child failed');
  process.stdout.write(result.stdout);
} else {
  const proxyaddr = expressRequire('proxy-addr');
  const request = { socket: { remoteAddress: '203.0.113.4' }, headers: { 'x-forwarded-for': '10.0.0.1' } };
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust('203.0.113.4'), false);
    assert.equal(proxyaddr(request, trust), '203.0.113.4');
  }
  for (const subnet of ['10.0.0.0/8', '::ffff:10.0.0.0/104']) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust('10.2.3.4'), true);
    assert.equal(trust('203.0.113.4'), false);
    assert.equal(proxyaddr({ ...request, socket: { remoteAddress: '10.2.3.4' } }, trust), '10.0.0.1');
  }
  assert.equal(workerRequire('express')().get('trust proxy'), false);
  console.log('PASS Express proxy resolution, mapped-subnet spoof rejection and valid trust ranges');

  const { parseBuffer } = await import(pathToFileURL(metadataEntry).href);
  const wave = Buffer.alloc(48);
  wave.write('RIFF'); wave.writeUInt32LE(40, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(4, 40);
  const metadata = await parseBuffer(wave, { mimeType: 'audio/wav' });
  assert.equal(metadata.format.sampleRate, 8000);
  assert.equal(metadata.format.numberOfChannels, 1);
  assert.equal(metadata.format.bitsPerSample, 16);
  const ebml = Buffer.from('1a45dfa38a428201ffffffffffffff', 'hex');
  await assert.rejects(parseBuffer(ebml, { mimeType: 'video/webm' }), /Invalid element length/);
  const mp4 = Buffer.from('00000010667479704d34412000000000000000207374736400000000ffffffff000000006d7034610000000000000001', 'hex');
  await assert.rejects(parseBuffer(mp4, { mimeType: 'audio/mp4' }), /Invalid stsd sample entry size: 0/);
  console.log('PASS Baileys metadata resolution, valid PCM, oversized EBML and zero-size MP4 rejection');

  const { deepmerge, deepmergeInto } = configRequire('deepmerge-ts');
  assert.deepEqual(deepmerge({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' } },
    { migrations: { seed: 'node seed.mjs' } }), {
    schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations', seed: 'node seed.mjs' },
  });
  const left = {}; left.self = left;
  const right = {}; right.self = right;
  const merged = deepmerge(left, right);
  assert.equal(merged.self, merged);
  const target = {}; target.self = target;
  deepmergeInto(target, right);
  assert.equal(target.self, target);
  assert.equal(configRequire('@prisma/config').defineConfig({ schema: 'prisma/schema.prisma' }).schema,
    'prisma/schema.prisma');
  console.log('PASS Prisma scoped merge resolution, ordinary records, cyclic merge/mergeInto and defineConfig');
}
