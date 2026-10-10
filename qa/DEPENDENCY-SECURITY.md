# Integrated backend dependency repairs

This candidate starts from `origin/main` commit `bbe2524`, preserving its current application code, React 19.2.4, Prisma 6.19.3, PostgreSQL adapter 7.6.0, and pg 8.20.0. Main already locks Next 16.3.8; the manifest and ESLint configuration now align with that version. Compatible tooling and sharp updates accompany the reviewed dependency repair.

The scoped `@prisma/config` override selects published `deepmerge-ts@8.0.2`. It repairs recursive-object stack exhaustion without migrating Prisma. Version 8 changes deep-Map merging semantics; Prisma's inspected configuration consumer merges ordinary configuration records. The regression harness checks normal records, cyclic `deepmerge`, cyclic `deepmergeInto`, and the real Prisma configuration module.

The retained `braces@3.0.3` version receives the previously reviewed local patch: a depth limit of 128 bounds parsing, compile/expand/stringify AST traversal, and expansion parent-chain traversal. Tests cover deeply nested strings, directly supplied deep/cyclic ASTs and parent cycles, alongside ordinary braces and actual Micromatch usage. The original package version stays visible to audit scanners; applying a backport does not remove an upstream advisory.

`postinstall` runs `patch-package --error-on-fail` before the existing `prisma generate`. Keep `patches/` and both package manifests together. The patch tool is a production dependency so the lifecycle hook remains available in production installations. A runnable installation must apply the patch; do not silently skip installation scripts.

Vitest 4.1.11 resolves Vite 8.3.4. That Vite version requires PostCSS `^8.5.29`, so this candidate raises the existing global PostCSS override to `^8.5.29`. The prior isolated QA lock forced PostCSS 8.5.26, below this requirement. The harness now checks the actual resolved compatibility and runs the real PostCSS consumer.

Run from this worktree's own normal installation:

```text
node qa/dependency-security.mjs
```

The retained main lock also needed compatible published updates for `@humanfs/node` (0.16.8) and every `brace-expansion` installation (1.1.21 / 5.0.12). These were updated within their existing parent ranges, without forced major upgrades.

The clean initial `npm ci` installed 677 packages and successfully applied the braces patch and generated Prisma Client 6.19.3. The two targeted transitive updates followed in the same normal installation, then an explicit final `postinstall`, all three dependency regression groups, and current-main Prisma schema validation passed. A second cold `npm ci` of the final transitive lock was not run. No shared dependency junction, environment file, database schema or hosted service was changed.

The final unmodified audit reports **7 high package entries for the full installation** and **4 high entries with development dependencies omitted**, with zero moderate or critical entries. Both reports represent the same remaining upstream `braces` advisory; its installed source is patched. No advisory suppression or package-version fabrication is used. Raw audit JSON and version/source hashes are in `qa/evidence/`, with the summary in `qa/evidence/dependency-security-2026-10-10.json`.

The October 9 isolated candidate's counts and checks are historical and are not evidence that this integration candidate passed. Full application gates, deployment and live clinic QA remain separate checks. This task retained main's existing Prisma 6.19.3 / adapter-pg 7.6.0 pairing; database compatibility is checked by the separate integrated database gates, not inferred from dependency installation.

Primary sources: [deepmerge-ts advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx), [v8 release semantics](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0), [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Registry metadata for the exact selected Vite and PostCSS versions was checked before installation.
