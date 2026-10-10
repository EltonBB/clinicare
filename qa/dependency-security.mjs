import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const braces = require('braces');
assert.deepEqual(braces.expand('src/{app,lib}/{a,b}.ts'), ['src/app/a.ts', 'src/app/b.ts', 'src/lib/a.ts', 'src/lib/b.ts']);
assert.deepEqual(require('micromatch')(['src/a.ts', 'src/b.tsx', 'x.txt'], 'src/*.{ts,tsx}'), ['src/a.ts', 'src/b.tsx']);
for (const pattern of ['{'.repeat(4000) + 'x' + '}'.repeat(4000), '{'.repeat(4000), '('.repeat(4000) + 'x' + ')'.repeat(4000)]) {
  assert.throws(() => braces.parse(pattern), /security limit/);
}
for (const method of ['compile', 'expand', 'stringify']) {
  let node = { type: 'text', value: 'x' };
  for (let i = 0; i < 500; i++) node = { type: 'root', nodes: [node] };
  assert.throws(() => braces[method](node), /security limit/);
  const cycle = { type: 'root', nodes: [] };
  cycle.nodes.push(cycle);
  assert.throws(() => braces[method](cycle), /security limit/);
}
const parentCycle = { type: 'paren', nodes: [] };
parentCycle.parent = parentCycle;
assert.throws(() => braces.expand(parentCycle), /security limit/);
const configRequire = createRequire(require.resolve('@prisma/config'));
const { deepmerge, deepmergeInto } = configRequire('deepmerge-ts');
assert.match(configRequire.resolve('deepmerge-ts'), /deepmerge-ts/);
assert.deepEqual(deepmerge({ schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations' } }, { migrations: { seed: 'node seed.mjs' } }), {
  schema: 'prisma/schema.prisma', migrations: { path: 'prisma/migrations', seed: 'node seed.mjs' },
});
const left = {};
left.self = left;
const right = {};
right.self = right;
const merged = deepmerge(left, right);
assert.equal(merged.self, merged);
const target = {};
target.self = target;
deepmergeInto(target, right);
assert.equal(target.self, target);
assert.equal(typeof require('@prisma/config').defineConfig, 'function');
const vitePackage = require('vite/package.json');
const postcssPackage = require('postcss/package.json');
assert.ok(require('semver').satisfies(postcssPackage.version, vitePackage.dependencies.postcss),
  `PostCSS ${postcssPackage.version} must satisfy Vite's ${vitePackage.dependencies.postcss}`);
assert.equal(require('postcss')([]).process('a { color: red }', { from: undefined }).css, 'a { color: red }');
console.log('PASS braces normal/malformed/deep/cyclic AST and micromatch contracts');
console.log('PASS scoped Prisma deepmerge plain config + recursive graph merge/mergeInto contracts');
console.log('PASS Vite/PostCSS dependency compatibility and actual PostCSS consumer');
