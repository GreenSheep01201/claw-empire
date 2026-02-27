# PLAN: Claw-Empire Runtime Stability

## Objective
Stabilize local runtime diagnostics and troubleshooting flow for settings- and auth-adjacent APIs without broad codebase changes.

## Scope
- In scope:
  - Runtime execution standard definition.
  - Diagnostics script for auth/session + settings + cli/oauth status endpoints.
  - Operational runbook for partial-clean recovery.
- Out of scope:
  - Application feature logic changes.
  - Database schema migrations.
  - Frontend behavior changes.

## Execution Standard
- Primary local run command on Windows:
  - `pnpm.cmd dev:local`
- Working directory:
  - repository root (`d:\test\claw-empire`)
- Backend-only diagnostic command (used by diagnostics script):
  - `pnpm.cmd exec tsx .\server\index.ts`
- Default backend target for diagnostics:
  - `http://127.0.0.1:8790`

## Gate Policy

### Blocked Gates (must pass to call runtime stable)
1. Process gate:
   - backend process starts and does not exit before readiness timeout.
2. Readiness gate:
   - TCP port `8790` becomes reachable within timeout.
3. Session gate:
   - `GET /api/auth/session` returns success and provides usable auth context (cookie and csrf token in response body).
4. Endpoint reachability gate:
   - `GET /api/settings`
   - `GET /api/cli-status`
   - `GET /api/oauth/status`
   - `GET /api/oauth/models`
   - Each endpoint must return a non-network error response (2xx/4xx/5xx acceptable for diagnostics visibility, but no transport failure).
5. Cleanup gate:
   - diagnostics script always attempts backend process-tree shutdown in `finally` when it started the process.

### Fallback Gates (allowed when blocked gate execution is not possible)
1. Existing-backend fallback:
   - Use diagnostics script with `-UseExistingBackend` when startup control is unavailable.
2. Non-mutating fallback:
   - Use `-SkipPut` to avoid writing settings during investigation.
3. Parse/control-flow fallback:
   - Use `-SkipHttp -WhatIf` to validate script syntax and control path without network or state mutation.
4. Endpoint triage fallback:
   - If one endpoint fails, continue collecting results from the remaining endpoints and emit consolidated table output.

## Partial-Clean Runbook
Use this when local runtime state is inconsistent but full environment reset is unnecessary.

1. Stop local runtime processes only:
   - End `pnpm`, `tsx`, and `node` trees related to this repo run (or use diagnostics-script managed startup/shutdown).
2. Keep persistent state:
   - Preserve `.env`, SQLite DB files, and project source files.
3. Clean ephemeral output only:
   - Remove transient folders if needed: `.tmp`, `dist`, `test-results`.
4. Reinstall only when lock/runtime mismatch is suspected:
   - `pnpm.cmd install --frozen-lockfile`
5. Restart with standard command:
   - `pnpm.cmd dev:local`
6. Validate API runtime:
   - Run `scripts/diagnose-settings.ps1` (normal mode or fallback mode).

## Acceptance Criteria
- `tasks/todo.md` includes implementation checklist and review notes for this work.
- `docs/plans/PLAN_claw-empire-runtime-stability.md` documents standard + gate model + runbook.
- `scripts/diagnose-settings.ps1` provides reproducible diagnostics output and reliable cleanup behavior.
