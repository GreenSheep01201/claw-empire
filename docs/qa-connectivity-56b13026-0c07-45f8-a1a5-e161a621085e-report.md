# QA Connectivity Report (Task Session 56b13026-0c07-45f8-a1a5-e161a621085e)

- Team/owner: `QA/QC - Lint`
- Generated at (UTC): `2026-02-20T13:45:32.310Z`
- Base URL: `http://127.0.0.1:8790`

## Checklist 1: Structure and baseline review

| Item | Status | Notes |
|---|---|---|
| scripts/test-comm-status.mjs baseline | FOUND | Legacy entrypoint for comm checks |
| server/modules/routes/ops.ts endpoints | VERIFIED | /api/cli-usage/refresh, /api/oauth/*, /api/api-providers/:id/test |
| server/security/auth.ts session flow | VERIFIED | /api/auth/session cookie bootstrap |

## Checklist 2-4: One-run communication tests

| Area | Script | Final Result | HTTP | Latency | Retry Count |
|---|---|---|---:|---:|---:|
| LLM | `scripts/qa/llm-comm-test.mjs` | PASS | 200 | 266ms | 0 |
| OAuth | `scripts/qa/oauth-comm-test.mjs` | FAIL | 200 | - | 0 |
| API | `scripts/qa/api-comm-test.mjs` | FAIL | 200 | - | 0 |

## Checklist 5: Integrated runner and evidence/report

- Integrated runner: `scripts/qa/run-comm-suite.mjs`
- Legacy compatibility entry: `scripts/test-comm-status.mjs`
- Evidence JSON: `logs/comm-check-2026-02-20T13-45-32-310Z.json`
- QA report: `docs/qa-connectivity-56b13026-0c07-45f8-a1a5-e161a621085e-report.md`

## Acceptance criteria

- HTTP status: `200`
- Max latency (SLA): `3000ms`
- LLM success rule: at least one provider returns `error=null` from `/api/cli-usage/refresh`
- OAuth success rule: refresh roundtrip (or model-fetch fallback) succeeds within SLA
- API success rule: one selected enabled provider returns `ok=true` from `/api/api-providers/:id/test` within SLA

## Retry and escalation policy

- Retry: each failed item retried up to 0 time(s) in the same run context.
- Escalation trigger: any item still FAIL after retries.
- Escalation action: notify Dev lead within 30 minutes with endpoint, latency, status, and evidence JSON path.

## Final result snapshot

- LLM: PASS (At least one LLM provider usage payload returned error=null.)
- OAuth: FAIL (No connected OAuth provider found in /api/oauth/status.)
- API: FAIL (none)
- Overall: **FAIL**

## Attempts

- LLM attempts: #1:PASS
- OAuth attempts: #1:FAIL
- API attempts: #1:FAIL

