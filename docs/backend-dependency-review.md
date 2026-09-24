# Backend dependency review — September 24, 2026

This update refreshes compatible tooling dependencies. It upgrades Vitest to 4.1.11, Browserslist to 4.28.9, baseline-browser-mapping to 2.11.21, @humanfs/node to 0.16.8 and the three-stdlib copy of fflate to 0.6.11. Their required tooling, browser data and native optional dependencies follow those updates. The PostCSS override minimum rises to 8.5.28 to meet Vite 8's declared dependency floor. No application code or Prisma schema changes.

The September 9 baseline audit reports 9 vulnerable package entries (4 high, 5 moderate). A fresh September 24 audit of this lock reports 3 high entries and no moderate/critical entries. These 3 entries represent one advisory propagated through deepmerge-ts -> @prisma/config -> prisma; they are not three independent application defects. A clean `npm ci`, 452 backend tests, TypeScript, ESLint, and a synthetic-environment production build passed on Windows. GitHub CI and independent review remain required before this update is ready.

## Remaining Prisma configuration advisory

[GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) affects deepmerge-ts before 8.0.0 when merging cyclic JavaScript object graphs. The advisory explicitly distinguishes that condition from plain JSON input. The retained Prisma 6.19.3 configuration package pins deepmerge-ts 7.1.5.

The inspected call is in @prisma/config's loadConfigTsOrJs: it supplies deepmerge to c12 for local Prisma configuration loading. Remote extension loading, rc files, package.json loading and default config extension are disabled there. This repository has no prisma.config file and does not import @prisma/config, deepmerge-ts or the Prisma CLI from application request handlers. Prisma commands run during installation/build or explicit operator database commands. Application database access imports @prisma/client and @prisma/adapter-pg. The dependency path is prisma 6.19.3 -> @prisma/config 6.19.3 -> deepmerge-ts 7.1.5.

On that evidence, no route from tenant or unauthenticated request data to the vulnerable cyclic-object configuration merge was identified in this baseline. This is a scoped non-reachability assessment, not a patched-library claim. Reassess if runtime configuration loading, remote config extensions, dynamic JavaScript configuration or untrusted configuration inputs are introduced. A user who can execute a malicious local config already has code execution at that build/tool boundary.

Do not force a Prisma major migration or the audit tool's downgrade suggestion just to erase the report. Keep the advisory visible and revisit a compatible upstream fix. Worker and mobile audits, their reachable vulnerabilities, production configuration and deployment verification remain separate remediation work.
