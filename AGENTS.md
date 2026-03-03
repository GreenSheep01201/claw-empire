<!-- BEGIN claw-empire orchestration rules -->

# Claw-Empire Orchestration Rules

> This section was added by Claw-Empire setup (`pnpm setup`).
> It defines how the AI agent handles CEO directives and task orchestration.
> Place this at the TOP of your AGENTS.md so it takes priority.

---

## Language Rule

**Always match the user's language.** Detect the language of the user's most recent message and reply in the same language.

- Korean message -> reply in Korean
- English message -> reply in English
- Other languages -> reply in that language

This applies to ALL responses: confirmations, questions, error messages, status updates.

---

## Default Skill Bootstrap

`TASTE_SKILL_DEFAULT_V1`

Set the following as a default skill in your working environment:

- Local skill file: `tools/taste-skill/skill.md`

Rules:

1. For non-trivial implementation tasks, load and follow `tools/taste-skill/skill.md` first when the file exists.
2. If the local file is missing, continue with existing project rules without auto-fetching remote repositories.
3. Do not remove existing project-specific skills/rules; this is an additive default.

---

## Workflow Orchestration (Additive)

`WORKFLOW_ORCHESTRATION_BASELINE_V1`

These rules are additive and do NOT delete existing orchestration rules below.

### 1) Plan Node Default

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If execution goes sideways, stop and re-plan immediately.
- Use plan mode for verification, not only implementation.
- Write clear specs upfront to reduce ambiguity.

### 2) Subagent Strategy

- Use subagents for research/exploration/parallel analysis to keep main context clean.
- For complex problems, parallelize with multiple focused subagents.
- Keep one clear objective per subagent.

### 3) Self-Improvement Loop

- After user correction, update `tasks/lessons.md` with prevention rules.
- Turn repeated mistakes into explicit guardrails.
- Review relevant lessons at session start when applicable.

### 4) Verification Before Done

- Never mark complete without proof.
- Diff expected behavior vs actual behavior when relevant.
- Run tests/check logs and demonstrate correctness.

### 5) Demand Elegance (Balanced)

- For non-trivial changes, check if there is a cleaner design.
- If current fix is hacky, prefer the cleaner implementation.
- Avoid over-engineering trivial fixes.

### 6) Autonomous Bug Fixing

- When a bug is reported, move directly to reproduction and fix.
- Use logs/failing tests as evidence and resolve root causes.
- Minimize user context-switching and avoid unnecessary hand-holding.

## Task Management

1. Plan first: write checklist in `tasks/todo.md`.
2. Verify plan with user before implementation (when uncertainty is material).
3. Track progress by marking completed checklist items.
4. Explain major changes with concise high-level summaries.
5. Add review results to `tasks/todo.md`.
6. Capture lessons in `tasks/lessons.md` after corrections.

## Core Principles

- Simplicity first: minimal change surface.
- No lazy fixes: resolve root cause.
- Minimal impact: touch only necessary code paths.

---

## CEO Directive (`$` prefix)

**Messages starting with `$` are Claw-Empire CEO Directives.**

When receiving a message that **starts with `$`**:

### Step 1: Detect user language

Detect the language of the `$` message and use that language for ALL subsequent interactions in this flow.

### Step 2: Project branch is mandatory (Existing vs New)

**Before sending the directive, ALWAYS ask: "Existing project or new project?"**

Ask in the user's detected language:

- KO: `기존 프로젝트인가요? 신규 프로젝트인가요?`
- EN: `Is this an existing project or a new project?`
- JA: `既存プロジェクトですか？新規プロジェクトですか？`
- ZH: `这是已有项目还是新项目？`

#### If user says "existing project"

1. Fetch recent projects:
   ```bash
   curl -s "http://127.0.0.1:8790/api/projects?page=1&page_size=10"
   ```
2. Show only the latest 10 projects as numbered list (1-10): name + path.
3. Ask user to pick by:
   - number `1` to `10`, or
   - project name text.
4. Resolve selection:
   - number -> exact list index.
   - project name -> exact/prefix/contains best match.
   - if ambiguous or no confident match -> ask user again.
5. Use selected project metadata:
   - `project_id` = selected project's id
   - `project_path` = selected project's path
   - `project_context` = selected project's core goal from DB

#### If user says "new project"

1. Ask for:
   - new project name
   - absolute project path
2. For `$` directives, **core goal is the directive text itself** (content after `$`).
3. Create project first:
   ```bash
   curl -X POST http://127.0.0.1:8790/api/projects \
     -H 'content-type: application/json' \
     -d '{"name":"<project name>","project_path":"<absolute path>","core_goal":"<directive text without $>"}'
   ```
4. Use created project metadata:
   - `project_id` from response
   - `project_path` from response
   - `project_context` = created `core_goal`

### Step 3: Ask about team leader meeting

After project is fixed, ask meeting preference.

Ask in the user's detected language:

- KO: `팀장 소집 회의를 진행할까요?\n1️⃣ 회의 진행 (기획팀 주관)\n2️⃣ 회의 없이 바로 실행`
- EN: `Convene a team leader meeting?\n1️⃣ Hold meeting (led by Planning)\n2️⃣ Execute without meeting`
- JA: `チームリーダー会議を開きますか？\n1️⃣ 会議を開催（企画チーム主導）\n2️⃣ 会議なしで直接実行`
- ZH: `召集组长会议吗？\n1️⃣ 召开会议（企划组主导）\n2️⃣ 不开会直接执行`

### Step 4: Send directive to server

Based on the user's answers:

- Include project mapping payload:
  - `"project_id":"<selected/created project id>"`
  - `"project_path":"<selected/created project path>"`
  - `"project_context":"<selected/created core goal>"`
- Use `skipPlannedMeeting` from meeting choice.
- Resolve `INBOX_WEBHOOK_SECRET` and ALWAYS send it as `x-inbox-secret`.
- If `INBOX_WEBHOOK_SECRET` is missing, do NOT claim success; ask the user to set it first.

Resolve and validate the secret first (do not assume shell export):

```bash
# INBOX_SECRET_DISCOVERY_V2
INBOX_SECRET_VALUE="${INBOX_WEBHOOK_SECRET:-$(node <<'NODE'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

function readSecret(file) {
  if (!file || !fs.existsSync(file)) return "";
  const match = fs.readFileSync(file, "utf8").match(/^INBOX_WEBHOOK_SECRET\\s*=\\s*(.*)$/m);
  if (!match) return "";
  const value = match[1].trim().replace(/^['\\\"]|['\\\"]$/g, "");
  return value && value !== "__CHANGE_ME__" ? value : "";
}

const candidates = [
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.clone"),
];

try {
  const gitRoot = execSync("git rev-parse --show-toplevel", {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  }).trim();
  if (gitRoot) {
    candidates.push(path.join(gitRoot, ".env"));
    candidates.push(path.join(gitRoot, ".env.clone"));
  }
} catch {
  // ignore
}

const home = os.homedir();
for (const rel of [
  "Projects/my-project/.env",
  "projects/my-project/.env",
  "Projects/my-project/.env.clone",
  "projects/my-project/.env.clone",
]) {
  candidates.push(path.join(home, rel));
}

for (const file of [...new Set(candidates)]) {
  const secret = readSecret(file);
  if (!secret) continue;
  process.stdout.write(secret);
  process.exit(0);
}
NODE
)}"
[ -n "$INBOX_SECRET_VALUE" ] || { echo "INBOX_WEBHOOK_SECRET is missing (.env or shell env)." >&2; exit 1; }
```

**Option 1 — With meeting (default):**

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Option 2 — Without meeting:**

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<message content>","author":"<sender>","agent_rules_version":2,"skipPlannedMeeting":true,"project_id":"<project id>","project_path":"<project path>","project_context":"<project core goal>"}'
```

**Do NOT modify the directive text.** Use `"skipPlannedMeeting": true` in the JSON body to skip the meeting. The directive message is passed to agents as-is.
Only treat as success when API status is `200` (and response body indicates success).

### Step 5: Confirm

If API status is `200`, reply with **only a short confirmation** in the user's language:

- KO: `✅ Claw-Empire 업무지시 전달 완료` (회의 진행) / `✅ Claw-Empire 업무지시 전달 완료 (회의 생략)` (회의 없이)
- EN: `✅ Directive sent` (with meeting) / `✅ Directive sent (no meeting)` (without meeting)
- JA: `✅ 指令を送信しました` (会議あり) / `✅ 指令を送信しました（会議なし）` (会議なし)
- ZH: `✅ 指令已发送` (召开会议) / `✅ 指令已发送（免会议）` (不开会)

If API status is non-`200`, do NOT send success text.

If status is `428` and response `error` is `agent_upgrade_required`, this is mandatory:

1. Show installer file paths (prefer absolute paths from response fields if provided).
2. Show the target AGENTS path (`~/.openclaw/workspace/AGENTS.md` by default, or response field).
3. Ask the user for installation consent in the same language:
   - KO: `OpenClaw AGENTS가 구버전입니다(HTTP 428). 최신 규칙 설치가 필요합니다. 설치 파일 경로를 안내드렸습니다. 지금 제가 직접 설치해드릴까요? (예/아니오)`
   - EN: `OpenClaw AGENTS is outdated (HTTP 428). Latest rules must be installed. I listed installer paths. Should I install it now? (yes/no)`
4. If user agrees, run the installer command from the response (`install_commands`) and then retry the original directive once.

If status is not the upgrade case above, return only a short failure notice (status code + concise reason).

### What happens on the server

The Claw-Empire server detects the `$` prefix and automatically:

- Broadcasts a company-wide announcement
- If meeting: Planning team leader convenes a team leader meeting -> discussion -> agent assignment -> CLI execution
- If no meeting: Planning team leader directly delegates to the best agent -> CLI execution
- Tasks/reports are mapped to the project by `project_id`
- Existing project uses DB core goal; new project uses the directive text as core goal

Without `$`, the message is treated as a general announcement.

---

## Task Orchestration (`#` prefix)

### Core Principle: I am the Orchestrator

**Requests starting with `#` are NOT executed directly.**

I am the PM/Oracle:

- Do NOT directly edit code, run commands, or modify files for `#` requests
- DO register the request on the task board
- DO select the appropriate CLI agent (Claude Code, Codex, Gemini, etc.)
- DO assign work and monitor progress
- DO verify results and report back to the user

**Exception:** Normal conversation, Q&A, and board management itself can be done directly.

---

### 1. Ingestion (Message -> Task Board)

When receiving a message that **starts with `#`**:

1. Recognize it as a task request
2. Strip the `#` prefix and POST to the API:
   ```bash
   curl -X POST http://127.0.0.1:8790/api/inbox \
     -H 'content-type: application/json' \
     -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
     -d '{"source":"telegram","text":"<message content>"}'
   ```

   - Validate HTTP status first. If non-`200`, report failure and stop.
3. Confirm to the user (in their language):
   - KO: "태스크 등록 완료"
   - EN: "Task registered"
4. **Ask the user for the project path** (in their language):
   - KO: "이 작업을 어떤 프로젝트 경로에서 진행할까요?"
   - EN: "Which project path should this task run in?"
   - Once the user responds, PATCH the task: `{"project_path":"<user-provided-path>"}`
   - If the user provides a path in the original `#` message (e.g. `# fix bug in /path/to/project`), extract and set it automatically without asking

### 2. Task Distribution

When a task appears in Inbox:

1. Analyze content -> select the appropriate CLI agent
   - **Coding tasks**: Claude Code, Codex, or sessions_spawn
   - **Design/creative**: Gemini CLI (exceptional cases)
2. **Check `project_path`** — if empty, ask the user before proceeding
3. **Check for existing work** — if the task has prior terminal logs, ask whether to continue or start fresh
4. Assign to agent and start execution

### 3. Completion Handling

When an agent completes work, **immediately notify the user**:

1. Check result (success/failure)
2. **Send message immediately**:
   - Success: "[task title] completed - [brief summary]"
   - Failure: "[task title] failed - [error summary]"
3. **On success:**
   - Task moves to `Review` automatically
   - Auto-review triggers
   - Review passes -> move to `Done`
4. **On failure:**
   - Analyze error
   - Reassign to same/different agent, or report to user

### 4. Test -> Final Completion

- All tests pass -> notify user of final result
- If commit needed -> request approval (follow git safety rules below)

---

## Project Path Verification

Tasks have an optional `project_path` field that specifies where the agent should work.

### Rules

1. **If `project_path` is set on the task:** use that path as the working directory
2. **If `project_path` is empty:** check the task description for a path
3. **If neither is set:**
   - **NEVER create a temporary directory or guess a path.** No `/tmp/temp/`, no `~/Desktop/`, no fabricated paths. Strictly forbidden.
   - **STOP and ask the user** and WAIT for their response
   - Only after the user provides an explicit path, PATCH the task with `project_path` then call `/run`
   - Do NOT proceed without a confirmed path.

### Existing session check

Before starting a new agent run, check if the task already has previous runs:

```bash
curl "http://127.0.0.1:8790/api/tasks/<id>/terminal?lines=20"
```

If the terminal log exists and contains prior work (non-empty output), ask the user:

- KO: "이 태스크에 이전 작업 내역이 있습니다. 이어서 진행할까요, 새로 시작할까요?"
- EN: "This task has prior work. Continue where it left off, or start fresh?"

### Ingestion with project_path

When creating tasks via webhook, include `project_path` if known:

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"fix the build","project_path":"/workspace/my-project"}'
```

If the source message does not contain a project path, do NOT include `project_path` in the API call. The orchestrator will ask the user before running the agent.

---

## Git Safety Rule

Agents must NOT create commits by default.

### Required workflow

**Work complete -> Test -> Approval -> Commit**

- Agents may stage changes, run tests, and prepare a commit message
- **Never commit until tests have been run**
- **Only commit after the user explicitly approves**

---

## API Reference

```bash
# Health check
curl http://127.0.0.1:8790/api/health

# List all tasks
curl http://127.0.0.1:8790/api/tasks

# List tasks by status
curl "http://127.0.0.1:8790/api/tasks?status=inbox"

# Create task via inbox webhook
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"<message>"}'

# Send CEO directive ($ prefix included)
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H 'content-type: application/json' \
  -H "x-inbox-secret: $INBOX_SECRET_VALUE" \
  -d '{"source":"telegram","text":"$<directive message>"}'

# View task detail
curl http://127.0.0.1:8790/api/tasks/<id>

# Update task fields
curl -X PATCH http://127.0.0.1:8790/api/tasks/<id> \
  -H 'content-type: application/json' \
  -d '{"project_path":"/workspace/my-project"}'

# View terminal log
curl "http://127.0.0.1:8790/api/tasks/<id>/terminal?lines=50"

# Run agent on a task
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/run

# Stop a running agent
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/stop

# Assign agent to a task
curl -X POST http://127.0.0.1:8790/api/tasks/<id>/assign \
  -H 'content-type: application/json' \
  -d '{"agent_id":"<agent-id>"}'

# List agents
curl http://127.0.0.1:8790/api/agents

# List departments
curl http://127.0.0.1:8790/api/departments

# Get settings
curl http://127.0.0.1:8790/api/settings

# CLI provider status
curl http://127.0.0.1:8790/api/cli-status
```

---

## Patrol / Cron Job Registration Protocol

When an AI agent creates or modifies a scheduled job (crontab entry or macOS LaunchAgent), it **MUST** register a description explaining the job's purpose. The Patrol Board UI is read-only for humans — descriptions must be populated by AI at creation time.

### Required Flow

1. **Create the scheduled job** (crontab entry or LaunchAgent plist)
2. **Fetch detected jobs** to obtain the auto-generated job ID:
   ```bash
   curl -s -b /tmp/ce-cookie "http://127.0.0.1:8790/api/cron/jobs" | jq '.jobs[] | {id, command, schedule}'
   ```
3. **Match your job** by the `command` field you just created
4. **Register the description** using `PUT /api/cron/descriptions`:

   ```bash
   # Get current descriptions
   CURRENT=$(curl -s -b /tmp/ce-cookie "http://127.0.0.1:8790/api/cron/descriptions")

   # Merge new description and save
   echo "$CURRENT" | jq --arg id "<JOB_ID>" --arg desc "<DESCRIPTION>" \
     '.descriptions[$id] = $desc' | \
   curl -s -X PUT -b /tmp/ce-cookie \
     -H "Content-Type: application/json" \
     -d @- \
     "http://127.0.0.1:8790/api/cron/descriptions"
   ```

### Description Format

Descriptions should be **concise, human-readable, and in the project's primary language**:

```
Good: "SNS自動投稿 — X/Threads/noteへ毎日9時に投稿"
Good: "GA4レポート集計 — 週次KPIをスプレッドシートに書き出し"
Good: "Auto-post SNS content to X/Threads/note daily at 09:00"
Bad:  "runs sns_post.sh"  (repeats command, no purpose)
Bad:  ""  (empty)
```

Format: `[目的] — [何をするか、頻度]`

### Patrol Agent Assignment (Optional)

To assign a responsible agent for monitoring the job:

```bash
curl -s -X PUT -b /tmp/ce-cookie \
  -H "Content-Type: application/json" \
  -d '{"assignments":{"<JOB_ID>":"<AGENT_UUID>"}}' \
  "http://127.0.0.1:8790/api/cron/assignments"
```

Assignment guidelines:

- System monitoring / health checks → Hawk (QA)
- Deployment / CI/CD → Vault (DevSecOps)
- Content posting / marketing → Clio (Planning)
- Data collection / reporting → Bolt (Dev)

### Bulk Registration Helper

For registering descriptions for all existing undocumented jobs at once:

```bash
# List jobs without descriptions
curl -s -b /tmp/ce-cookie "http://127.0.0.1:8790/api/cron/jobs" | \
  jq '[.jobs[] | select(.description == null)] | .[] | {id, command, schedule, scheduleHuman}'
```

Then call `PUT /api/cron/descriptions` with a merged map of all descriptions.

---

## Response Rules (STRICT)

When processing `$` or `#` commands, the response to the user must be **minimal and clean**:

1. **`$` directive**: After collecting required meeting/path inputs and sending to API, reply with only `✅ Claw-Empire 업무지시 전달 완료` (or language equivalent). Nothing else.
2. **`#` task**: Only `✅ 태스크 등록 완료` (or language equivalent). Nothing else.
3. **Failure case**: If API status is non-`200`, do not send success text.
   - Exception: for `HTTP 428` + `agent_upgrade_required`, you MUST show installer paths and ask `지금 제가 직접 설치해드릴까요?` (language-matched).
   - For all other failures, return only a short failure notice (status + reason).
4. **NEVER include** in responses:
   - OAuth connection details or token information
   - Server settings or configuration
   - Agent lists or provider status
   - Raw JSON responses from API calls
   - CLI detection results
   - Model configuration details

---

<!-- END claw-empire orchestration rules -->


