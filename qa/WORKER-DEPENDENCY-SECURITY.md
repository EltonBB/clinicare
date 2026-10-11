# WhatsApp worker dependency repair

Verified locally on October 11, 2026, after the user installed the revised worker lock successfully. Before this repair, the worker's raw full and production audits reported five package entries: one critical (`proxy-addr`), three high (the `deepmerge-ts` → `@prisma/config` → Prisma chain), and one moderate (`music-metadata`). Fresh full and production worker audits now both return zero findings. The root application dependency audit does not cover this separately locked service.

This repair keeps the worker's existing direct dependency versions and changes four lock nodes to their published registry versions and integrity hashes:

| Package | Previous | Selected | Reason |
| --- | --- | --- | --- |
| `proxy-addr` | 2.0.7 | 2.0.8 | Repairs IPv4-mapped IPv6 proxy-trust matching. Fits Express's existing range. |
| `music-metadata` | 11.13.0 | 11.16.0 | Published media-parser repairs. Fits Baileys's existing `^11.7.0` range. |
| Its nested `content-type` | 2.0.0 | 2.1.0 | Satisfies music-metadata 11.16.0's updated `^2.1.0` requirement. |
| `deepmerge-ts` | 7.1.5 | 8.0.2 | Repairs merging of recursive records, through the same scoped `@prisma/config` override used by the root application. |

The existing production/development/optional classifications are preserved. Registry metadata was checked for every replacement and its dependency ranges; no package version or integrity value was invented. The Prisma override is the intentional major compatibility exception: v8 changes Map semantics, while the inspected Prisma consumer merges ordinary configuration records. The guarded regression includes this actual configuration module and recursive records.

Preparation checks passed: script syntax, all 330 declared required/development lock dependency edges (with the explicit Prisma override), and rejection of the old installed proxy package before any crafted inputs ran. After the successful manual installation, all four installed versions and their actual consumer resolution paths matched the reviewed lock. The four registry versions, integrity hashes and dependency classifications also remained unchanged. The same 330 dependency edges were checked again with zero mismatches. Version origins and source hashes are recorded in [installed dependency evidence](evidence/worker-dependency-installed-2026-10-11.json).

Fresh read-only audits of the worker's completed installation on October 11 returned exit code 0 with no critical, high, moderate, low or informational findings: [full audit](evidence/worker-audit-full-installed-2026-10-11.json) and [production audit](evidence/worker-audit-production-installed-2026-10-11.json). Earlier lock-only audits also passed, but the installed-version checks and consumer regressions are the evidence that the local modules changed.

Exposure review found no worker `trust proxy` setting or `req.ip` authorization/rate-limit use, and the current Baileys send path supplies text rather than invoking media metadata parsing. These findings narrow the current exposure; they do not remove the dependency advisories or replace the repairs.

The new regression passed against the installed modules in 1.44 seconds. It reads dependencies resolved by the worker's actual Express, Baileys and Prisma configuration consumers. It first rejects an old installation, then checks proxy spoof rejection, legitimate proxy ranges, a valid tiny PCM file, oversized EBML and zero-sized MP4 sample-entry rejection, and ordinary/cyclic configuration merging. A separate child process has a 15-second deadline to contain synchronous parser regressions. It uses fictional in-memory inputs and makes no database or provider requests.

The first run found an incorrect test expectation: the crafted top-level MP4 `stsd` fixture throws `Mp4ContentError: Invalid stsd sample entry size: 0`; the test had incorrectly expected a warning result. The assertion was corrected to require that exact rejection, and the initial failure log was retained. This changed no worker application code and weakened no production behavior or test expectation.

Run from the repository after installing the reviewed worker lock:

```text
node qa/worker-dependency-security.mjs
```

The revised lock is installed locally, the consumer security regressions pass (1.44 seconds), and the fresh full/production worker audits are clean. Post-install worker TypeScript passed in 19.477 seconds; the full repository unit suite passed all 1,679 tests across 93 files with zero failures in 75.654 seconds. The final scoped security-harness lint also passed in 3.274 seconds. The worker is deployed separately from the Next application; this local patch does not update the running provider worker.

Primary sources: [proxy-addr advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h), [EBML advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-5gfj-9q3v-qfp3), [MP4 advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-f94x-6692-553q), [DSF advisory](https://github.com/Borewit/music-metadata/security/advisories/GHSA-8j4c-6x6g-rq3j), and [deepmerge-ts advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx).
