# Attachment Guidance Disposition — 2026-08-21

The attached review notes were treated as planning input rather than as instructions to change production infrastructure. This Padres Operations and preference release preserves its existing production-only dependency audit in the release gate and keeps the requested interface work separate from unrelated deployment changes.

| Guidance | Disposition in this release | Reason |
|---|---|---|
| Run a production dependency audit before release. | **Adopted.** | The release gate includes `pnpm audit --prod`; it completed without known production advisories. |
| Maintain provider request limits and hidden-tab efficiency. | **Adopted.** | Recent results reuse one five-minute cached official schedule snapshot and load only in Operations. Existing hidden-tab Intel Feed protections remain unchanged. |
| Merge or alter Vercel handler routing. | **Deferred.** | The requested feature work does not require a routing migration; mixing it with application UI changes would make review and rollback less clear. |
| Upgrade Vite, Vitest, pnpm, and related development tooling. | **Deferred to a dedicated hardening release.** | The attachment identifies development-toolchain advisories that should be upgraded and tested in isolation, rather than combined with a Padres workflow feature. |
| Create a heartbeat or uptime-monitor migration. | **Deferred.** | No schedule or database change is needed for venue metadata, browser preferences, or recent-results presentation. |

The code changes in this release do not add untrusted HTML execution paths, external credentials, new provider families, or scheduled jobs. Venue and game values remain sourced from the existing official MLB Stats API integration; the default-team preference is stored only in the current browser.
