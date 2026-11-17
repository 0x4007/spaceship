# Decisions

## 2026-11-17: Reuse the authenticated VPS inference bridge

The deployed app starts in flight mode behind the VPS directory's existing Ubiquity Passport administrator guard. It obtains the existing session's CSRF token from `/api/account/session` and posts only bounded completion or judgment inputs to `/api/apps/spaceship/inference`, using same-origin cookies. CSRF remains in memory. The browser selects no provider or model and receives no upstream credential. The server owns the fixed `ubiquity/deepseek-flash` Responses route.

Normalized completion streams contain `delta`, `done` and safe `error` events. An unfinished stream is a failure; cancellation and early iterator return close the response reader. Judgment answers contain only finite `score` or `noul` estimates for the requested IDs, without claims of calibrated probabilities or invented provider usage. Permanent failures stop new inference, and failed or partially delivered generations wait for a deliberate reload. The existing simulator remains explicitly available through `live=false` and makes no inference requests.

The provider-key dialog and key reads/writes are removed. Startup removes only the two legacy Spaceship key names, without reading their values; unrelated browser preferences remain. Standalone server-side development prototypes remain separate from the shipped app.

Fresh repository metadata confirmed that this fork has no Pages site. The existing master/manual workflow therefore performs installation, tests and a build only, with read-only repository permissions and no Pages configuration, environment, upload or deployment. No second hosting surface or redirect site is created; `dist/` remains the VPS artifact.

The shared browser client admits at most four active requests and three background requests, reserving capacity for story continuation. Its cancellable pending queue is bounded at 32, and slots remain occupied through response cleanup. Permanent bridge failures, including `invalid_response` and `upstream_error`, block later inference until reload. Relevance leads are scored in batches of at most 20 while retaining their original indices; answer IDs are retained as own properties, including reserved JavaScript names.
