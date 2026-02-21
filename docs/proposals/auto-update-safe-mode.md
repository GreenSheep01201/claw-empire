# Auto Update (Safe Mode) Proposal

> Related issue: #24

## Why
Current release check only shows a banner. This proposal adds an **opt-in** auto-update path for operators who want lower maintenance overhead.

## Non-goals
- Auto-updating by default
- Forcing restart during active task execution
- Auto-applying major version jumps without explicit opt-in

## Runtime flags (proposed)
- `AUTO_UPDATE_ENABLED=0|1` (default `0`)
- `AUTO_UPDATE_CHANNEL=patch|minor|all` (default `patch`)
- `AUTO_UPDATE_IDLE_ONLY=1` (default `1`)
- `AUTO_UPDATE_CHECK_INTERVAL_MS` (default: `1800000`)
- `AUTO_UPDATE_RESTART_MODE=notify|exit|command` (default `notify`)
- `AUTO_UPDATE_RESTART_COMMAND=<command>` (required when mode=`command`)

## Decision flow
1. Periodic check fetches latest release tag from GitHub (same source as update banner).
2. Compare semver with current version and configured channel.
3. Run safety gates:
   - no `in_progress` tasks
   - no active CLI child processes
   - git working tree clean
   - fast-forwardable to target
4. Apply update:
   - `git pull --ff-only`
   - `pnpm install --frozen-lockfile`
5. Restart handling:
   - `notify`: announce "updated, restart required"
   - `exit`: clean shutdown so supervisor can restart
   - `command`: execute operator-provided restart command
6. Emit audit logs for all outcomes (checked/skipped/applied/failed).

## Safety gates and skip reasons
- `busy_tasks`
- `active_cli_processes`
- `dirty_worktree`
- `version_channel_not_allowed`
- `major_update_not_allowed`
- `fast_forward_not_possible`
- `install_failed`
- `restart_failed`

## API (optional)
- `POST /api/update-apply` (auth required)
  - Executes same pipeline on demand
  - Returns structured result + logs

## Observability
- Add `/api/update-auto-status` (optional) for:
  - last_check_at
  - last_result
  - last_error
  - next_check_at
  - running_state

## Rollout plan
1. **Phase 1**: RFC + env flags + dry-run mode logs only
2. **Phase 2**: manual `POST /api/update-apply`
3. **Phase 3**: periodic auto-apply with idle-only gate
4. **Phase 4**: restart-mode integrations and docs

## Risk management
- Keep default off
- Keep major updates opt-in
- Preserve current banner behavior when disabled
- Fail closed (skip, log, and notify)
