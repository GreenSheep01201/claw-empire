import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { WebSocket } from "ws";
import path from "node:path";

type Department = {
  id: string;
  name: string;
  sort_order: number;
};

type Agent = {
  id: string;
  department_id: string | null;
  role: string;
};

type Project = {
  id: string;
  project_path: string;
  assignment_mode: string;
  assigned_agent_ids: string[];
};

type Task = {
  id: string;
  title: string;
  status: string;
  assigned_agent_id: string | null;
  project_id: string | null;
  department_id: string | null;
};

type ReportSummary = {
  id: string;
};

type WsEnvelope = {
  type: string;
  payload: unknown;
  ts: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function expectOkJson<T>(response: APIResponse, label: string): Promise<T> {
  const text = await response.text();
  let parsed: unknown = {};
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${label}: JSON 파싱 실패 (status=${response.status()}): ${text.slice(0, 500)}`);
    }
  }
  if (!response.ok()) {
    throw new Error(`${label}: 요청 실패 (status=${response.status()}): ${text.slice(0, 1000)}`);
  }
  return parsed as T;
}

async function establishApiSession(request: APIRequestContext): Promise<string> {
  const timeoutMs = 30_000;
  const startedAt = Date.now();
  let lastStatus = 0;
  let lastText = "";

  while (Date.now() - startedAt < timeoutMs) {
    const response = await request.get("/api/auth/session");
    const text = await response.text();
    if (response.ok()) {
      break;
    }
    lastStatus = response.status();
    lastText = text;
    if (lastStatus === 502 || lastStatus === 503 || lastStatus === 404) {
      await sleep(500);
      continue;
    }
    throw new Error(`GET /api/auth/session 실패 (status=${lastStatus}): ${lastText.slice(0, 1000)}`);
  }

  if (lastStatus !== 0 && Date.now() - startedAt >= timeoutMs) {
    throw new Error(`GET /api/auth/session 타임아웃 (status=${lastStatus}): ${lastText.slice(0, 1000)}`);
  }

  const storage = await request.storageState();
  const sessionCookie = storage.cookies.find((cookie) => cookie.name === "claw_session");
  if (!sessionCookie) {
    throw new Error("WebSocket 테스트용 claw_session 쿠키를 찾을 수 없습니다.");
  }
  return `${sessionCookie.name}=${sessionCookie.value}`;
}

async function waitForTask(
  request: APIRequestContext,
  finder: (tasks: Task[]) => Task | undefined,
  timeoutMs: number,
): Promise<Task> {
  const startedAt = Date.now();
  let lastTasks: Task[] = [];
  while (Date.now() - startedAt < timeoutMs) {
    const tasksRes = await request.get("/api/tasks");
    const tasksJson = await expectOkJson<{ tasks: Task[] }>(tasksRes, "GET /api/tasks");
    const tasks = Array.isArray(tasksJson.tasks) ? tasksJson.tasks : [];
    lastTasks = tasks;
    const found = finder(tasks);
    if (found) return found;
    await sleep(350);
  }
  throw new Error(
    `조건에 맞는 task를 찾지 못했습니다. 최근 task=${lastTasks
      .slice(0, 10)
      .map((task) => `${task.id}:${task.title}:${task.status}`)
      .join(" | ")}`,
  );
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number, errorMessage: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await sleep(150);
  }
  throw new Error(errorMessage);
}

async function reorderDepartmentsWithRetry(
  request: APIRequestContext,
  deptA: string,
  deptB: string,
  maxRetries = 5,
): Promise<void> {
  // Ensure cookie session is established right before mutation calls.
  await establishApiSession(request);
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const baseOrder = 500_000 + Math.floor(Math.random() * 300_000) + attempt * 1000;
    const response = await request.patch("/api/departments/reorder", {
      data: {
        orders: [
          { id: deptA, sort_order: baseOrder + 2 },
          { id: deptB, sort_order: baseOrder + 1 },
        ],
      },
    });
    if (response.ok()) {
      await expectOkJson<{ ok: boolean }>(response, "PATCH /api/departments/reorder");
      return;
    }
    const text = await response.text();
    if (response.status() === 401) {
      await establishApiSession(request);
      await sleep(250);
      continue;
    }
    if (response.status() === 409 || response.status() === 500) {
      await sleep(250);
      continue;
    }
    throw new Error(`PATCH /api/departments/reorder 실패 (status=${response.status()}): ${text.slice(0, 500)}`);
  }
  throw new Error("PATCH /api/departments/reorder 재시도 초과");
}

async function connectWsWithSessionCookie(cookieHeader: string): Promise<WebSocket> {
  const baseUrl = new URL(process.env.PW_BASE_URL ?? "http://127.0.0.1:8810");
  const wsProtocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${wsProtocol}//${baseUrl.host}/ws`, {
    headers: {
      Cookie: cookieHeader,
      Origin: `${baseUrl.protocol}//${baseUrl.host}`,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("WebSocket 연결 타임아웃"));
    }, 10_000);

    ws.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  return ws;
}

test.describe("CI coverage gap expansion", () => {
  test.setTimeout(180_000);

  test("Task lifecycle + Department/Agent/Project CRUD + Chat + Directive + Report + Terminal", async ({ request }) => {
    const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const deptA = `ci_cov_dept_a_${seed}`;
    const deptB = `ci_cov_dept_b_${seed}`;
    const leaderName = `ci-cov-leader-${seed}`;
    const memberName = `ci-cov-member-${seed}`;
    const projectPath = path.resolve("test-results", "ci-e2e", "coverage", seed, "main");
    const directiveTitle = `ci-directive-${seed} @${deptA}`;

    await establishApiSession(request);

    const createDeptARes = await request.post("/api/departments", {
      data: {
        id: deptA,
        name: `Coverage Dept A ${seed}`,
        name_ko: `커버리지A-${seed}`,
        icon: "🧪",
        color: "#0ea5e9",
      },
    });
    const createDeptA = await expectOkJson<{ department: Department }>(createDeptARes, "POST /api/departments(A)");
    expect(createDeptA.department.id).toBe(deptA);

    const createDeptBRes = await request.post("/api/departments", {
      data: {
        id: deptB,
        name: `Coverage Dept B ${seed}`,
        name_ko: `커버리지B-${seed}`,
        icon: "🧪",
        color: "#22c55e",
      },
    });
    await expectOkJson<{ department: Department }>(createDeptBRes, "POST /api/departments(B)");

    const patchDeptARes = await request.patch(`/api/departments/${deptA}`, {
      data: {
        name: `Coverage Dept A Renamed ${seed}`,
        color: "#2563eb",
      },
    });
    const patchedDeptA = await expectOkJson<{ department: Department }>(patchDeptARes, "PATCH /api/departments/:id");
    expect(patchedDeptA.department.name).toContain("Renamed");

    await reorderDepartmentsWithRetry(request, deptA, deptB);

    const createLeaderRes = await request.post("/api/agents", {
      data: {
        name: leaderName,
        name_ko: `리더-${seed}`,
        department_id: deptA,
        role: "team_leader",
        cli_provider: "api",
        avatar_emoji: "🧪",
      },
    });
    const leaderJson = await expectOkJson<{ ok: boolean; agent: Agent }>(createLeaderRes, "POST /api/agents(leader)");
    expect(leaderJson.ok).toBe(true);
    const leaderId = leaderJson.agent.id;

    const createMemberRes = await request.post("/api/agents", {
      data: {
        name: memberName,
        name_ko: `멤버-${seed}`,
        department_id: deptA,
        role: "senior",
        cli_provider: "api",
        avatar_emoji: "🧪",
      },
    });
    const memberJson = await expectOkJson<{ ok: boolean; agent: Agent }>(createMemberRes, "POST /api/agents(member)");
    expect(memberJson.ok).toBe(true);
    const memberId = memberJson.agent.id;

    const patchMemberRes = await request.patch(`/api/agents/${memberId}`, {
      data: {
        role: "junior",
      },
    });
    const patchMember = await expectOkJson<{ ok: boolean; agent: Agent }>(patchMemberRes, "PATCH /api/agents/:id");
    expect(patchMember.ok).toBe(true);
    expect(patchMember.agent.role).toBe("junior");

    const createProjectRes = await request.post("/api/projects", {
      data: {
        name: `ci-cov-project-${seed}`,
        project_path: projectPath,
        core_goal: "coverage critical flows",
        assignment_mode: "manual",
        agent_ids: [memberId],
      },
    });
    const projectJson = await expectOkJson<{ ok: boolean; project: Project }>(createProjectRes, "POST /api/projects");
    expect(projectJson.ok).toBe(true);
    expect(projectJson.project.assignment_mode).toBe("manual");
    const projectId = projectJson.project.id;

    const patchProjectRes = await request.patch(`/api/projects/${projectId}`, {
      data: {
        name: `ci-cov-project-renamed-${seed}`,
        core_goal: "coverage critical flows updated",
        agent_ids: [memberId, leaderId],
      },
    });
    const patchedProject = await expectOkJson<{ ok: boolean; project: Project }>(
      patchProjectRes,
      "PATCH /api/projects/:id",
    );
    expect(patchedProject.ok).toBe(true);
    expect(patchedProject.project.assigned_agent_ids.sort()).toEqual([leaderId, memberId].sort());

    const createTaskRes = await request.post("/api/tasks", {
      data: {
        title: `ci-cov-task-${seed}`,
        description: "coverage lifecycle task",
        department_id: deptA,
        assigned_agent_id: memberId,
        project_id: projectId,
        status: "planned",
      },
    });
    const createTask = await expectOkJson<{ id: string; task: Task }>(createTaskRes, "POST /api/tasks");
    const taskId = createTask.id;
    expect(createTask.task.project_id).toBe(projectId);

    const assignRes = await request.post(`/api/tasks/${taskId}/assign`, {
      data: {
        agent_id: leaderId,
      },
    });
    const assignJson = await expectOkJson<{ ok: boolean; task: Task }>(assignRes, "POST /api/tasks/:id/assign");
    expect(assignJson.ok).toBe(true);
    expect(assignJson.task.assigned_agent_id).toBe(leaderId);

    const markInProgressRes = await request.patch(`/api/tasks/${taskId}`, {
      data: {
        status: "in_progress",
      },
    });
    const markInProgress = await expectOkJson<{ ok: boolean; task: Task }>(markInProgressRes, "PATCH /api/tasks/:id");
    expect(markInProgress.ok).toBe(true);
    expect(markInProgress.task.status).toBe("in_progress");

    const markDoneRes = await request.patch(`/api/tasks/${taskId}`, {
      data: {
        status: "done",
      },
    });
    const markDone = await expectOkJson<{ ok: boolean; task: Task }>(markDoneRes, "PATCH /api/tasks/:id");
    expect(markDone.ok).toBe(true);
    expect(markDone.task.status).toBe("done");

    const terminalRes = await request.get(`/api/tasks/${taskId}/terminal?lines=120&pretty=1`);
    const terminal = await expectOkJson<{
      ok: boolean;
      exists: boolean;
      text: string;
    }>(terminalRes, "GET /api/tasks/:id/terminal");
    expect(terminal.ok).toBe(true);
    expect(typeof terminal.exists).toBe("boolean");

    const sendMessageRes = await request.post("/api/messages", {
      data: {
        sender_type: "ceo",
        receiver_type: "all",
        content: `ci-cov-chat-${seed}`,
      },
    });
    await expectOkJson<{ ok: boolean; message: { id: string } }>(sendMessageRes, "POST /api/messages");

    const messagesRes = await request.get("/api/messages?limit=80");
    const messagesJson = await expectOkJson<{
      messages: Array<{ id: string; content: string }>;
    }>(messagesRes, "GET /api/messages");
    expect(messagesJson.messages.some((message) => message.content.includes(`ci-cov-chat-${seed}`))).toBe(true);

    const directiveRes = await request.post("/api/directives", {
      data: {
        content: directiveTitle,
        skipPlannedMeeting: true,
        project_id: projectId,
      },
    });
    await expectOkJson<{ ok: boolean; message: { id: string } }>(directiveRes, "POST /api/directives");

    const directiveTask = await waitForTask(
      request,
      (tasks) => tasks.find((task) => task.project_id === projectId && task.title.includes(`ci-directive-${seed}`)),
      60_000,
    );
    expect(directiveTask.project_id).toBe(projectId);

    const reportsRes = await request.get("/api/task-reports");
    const reportsJson = await expectOkJson<{ ok: boolean; reports: ReportSummary[] }>(
      reportsRes,
      "GET /api/task-reports",
    );
    expect(reportsJson.ok).toBe(true);
    expect(reportsJson.reports.some((report) => report.id === taskId)).toBe(true);

    const reportDetailRes = await request.get(`/api/task-reports/${taskId}`);
    const reportDetail = await expectOkJson<{ ok: boolean }>(reportDetailRes, "GET /api/task-reports/:taskId");
    expect(reportDetail.ok).toBe(true);

    // Cleanup is intentionally skipped in CI flow test.
    // Directive/delegation timers may still be running asynchronously right after POST /api/directives.
  });

  test("Settings/Stats/WebSocket/DecisionInbox + language setting persistence + input validation", async ({
    request,
  }) => {
    const seed = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const cookieHeader = await establishApiSession(request);
    const ws = await connectWsWithSessionCookie(cookieHeader);

    const receivedTypes = new Set<string>();
    const received: WsEnvelope[] = [];
    ws.on("message", (data: Buffer | string) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      try {
        const parsed = JSON.parse(raw) as WsEnvelope;
        received.push(parsed);
        receivedTypes.add(parsed.type);
      } catch {
        // ignore malformed frames
      }
    });

    const settingsPutRes = await request.put("/api/settings", {
      data: {
        language: "ja",
        uiDensity: "compact",
      },
    });
    await expectOkJson<{ ok: boolean }>(settingsPutRes, "PUT /api/settings");

    const settingsGetRes = await request.get("/api/settings");
    const settingsGet = await expectOkJson<{ settings: Record<string, unknown> }>(settingsGetRes, "GET /api/settings");
    expect(settingsGet.settings.language).toBe("ja");
    expect(settingsGet.settings.uiDensity).toBe("compact");

    const settingsGetRes2 = await request.get("/api/settings");
    const settingsGet2 = await expectOkJson<{ settings: Record<string, unknown> }>(
      settingsGetRes2,
      "GET /api/settings(second-read)",
    );
    expect(settingsGet2.settings.language).toBe("ja");

    const badDeptRes = await request.post("/api/departments", {
      data: {},
    });
    expect(badDeptRes.status()).toBe(400);

    const badProjectRes = await request.post("/api/projects", {
      data: {
        name: `bad-project-${seed}`,
        project_path: path.resolve("test-results", "ci-e2e", "coverage", seed, "bad"),
        core_goal: "invalid agent_ids payload",
        assignment_mode: "manual",
        agent_ids: "invalid-string",
      },
    });
    expect(badProjectRes.status()).toBe(400);

    const createTaskRes = await request.post("/api/tasks", {
      data: {
        title: `ci-cov-ws-task-${seed}`,
        department_id: "planning",
        status: "inbox",
      },
    });
    const createTask = await expectOkJson<{ id: string; task: Task }>(createTaskRes, "POST /api/tasks(ws)");
    const taskId = createTask.id;

    const sendMessageRes = await request.post("/api/messages", {
      data: {
        sender_type: "ceo",
        receiver_type: "all",
        content: `ci-ws-chat-${seed}`,
      },
    });
    await expectOkJson<{ ok: boolean; message: { id: string } }>(sendMessageRes, "POST /api/messages(ws)");

    await waitForCondition(
      () => receivedTypes.has("task_update") && receivedTypes.has("new_message"),
      15_000,
      `WebSocket 이벤트 대기 실패: ${[...receivedTypes].join(", ")}`,
    );

    const statsRes = await request.get("/api/stats");
    const statsJson = await expectOkJson<{
      stats: {
        tasks: { total: number };
      };
    }>(statsRes, "GET /api/stats");
    expect(statsJson.stats.tasks.total).toBeGreaterThan(0);

    const decisionInboxRes = await request.get("/api/decision-inbox");
    const decisionInbox = await expectOkJson<{ items: unknown[] }>(decisionInboxRes, "GET /api/decision-inbox");
    expect(Array.isArray(decisionInbox.items)).toBe(true);

    const badDecisionReplyRes = await request.post("/api/decision-inbox/not-exists/reply", {
      data: {
        option_number: 1,
      },
    });
    expect(badDecisionReplyRes.status()).toBe(404);

    ws.close();
  });
});
