import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskExecutionControlRouteDeps } from "./execution-control.ts";
import { registerTaskExecutionControlRoutes } from "./execution-control.ts";
import { buildTaskInterruptControlToken, getCsrfToken } from "../../../../security/auth.ts";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  assigned_agent_id: string | null;
  department_id: string | null;
  updated_at: number;
};

type AgentRow = {
  id: string;
  status: string;
  department_id: string | null;
  current_task_id: string | null;
};

type LinkedSubtaskRow = {
  id: string;
  task_id: string;
};

type FakeDbState = {
  tasks: Map<string, TaskRow>;
  agents: Map<string, AgentRow>;
  linkedSubtasksByDelegatedTask: Map<string, LinkedSubtaskRow[]>;
  interruptInjections: Array<{
    id: number;
    task_id: string;
    session_id: string;
    prompt_text: string;
    prompt_hash: string;
    actor_token_hash: string | null;
    created_at: number;
    consumed_at: number | null;
  }>;
  nextInterruptInjectionId: number;
};

type FakeRes = {
  statusCode: number;
  payload: unknown;
  status: (code: number) => FakeRes;
  json: (body: unknown) => FakeRes;
};

function createFakeRes(): FakeRes {
  return {
    statusCode: 200,
    payload: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.payload = body;
      return this;
    },
  };
}

function createFakeDb(state: FakeDbState): {
  prepare: (sql: string) => {
    get: (...args: any[]) => any;
    all: (...args: any[]) => any[];
    run: (...args: any[]) => { changes: number };
  };
} {
  return {
    prepare(sql: string) {
      if (sql.startsWith("SELECT * FROM tasks WHERE id = ?")) {
        return {
          get: (id: string) => state.tasks.get(id),
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      if (sql.startsWith("SELECT id, title, status FROM tasks WHERE id = ?")) {
        return {
          get: (id: string) => {
            const row = state.tasks.get(id);
            if (!row) return undefined;
            return { id: row.id, title: row.title, status: row.status };
          },
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      if (sql.startsWith("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")) {
        return {
          run: (status: string, updatedAt: number, id: string) => {
            const row = state.tasks.get(id);
            if (!row) return { changes: 0 };
            state.tasks.set(id, { ...row, status, updated_at: updatedAt });
            return { changes: 1 };
          },
          get: () => undefined,
          all: () => [],
        };
      }
      if (sql.startsWith("SELECT id, task_id FROM subtasks WHERE delegated_task_id = ?")) {
        return {
          all: (delegatedTaskId: string) => state.linkedSubtasksByDelegatedTask.get(delegatedTaskId) ?? [],
          get: () => undefined,
          run: () => ({ changes: 0 }),
        };
      }
      if (sql.startsWith("UPDATE subtasks SET status = 'blocked'")) {
        return {
          run: () => ({ changes: 0 }),
          get: () => undefined,
          all: () => [],
        };
      }
      if (sql.startsWith("SELECT COUNT(DISTINCT s.delegated_task_id) AS cnt")) {
        return {
          get: () => ({ cnt: 0 }),
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      if (sql.startsWith("SELECT * FROM subtasks WHERE id = ?")) {
        return {
          get: () => undefined,
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      if (sql.startsWith("UPDATE agents SET status = 'idle', current_task_id = NULL WHERE id = ?")) {
        return {
          run: (agentId: string) => {
            const row = state.agents.get(agentId);
            if (!row) return { changes: 0 };
            state.agents.set(agentId, { ...row, status: "idle", current_task_id: null });
            return { changes: 1 };
          },
          get: () => undefined,
          all: () => [],
        };
      }
      if (sql.startsWith("SELECT * FROM agents WHERE id = ?")) {
        return {
          get: (agentId: string) => state.agents.get(agentId),
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      if (
        sql.includes("INSERT INTO task_interrupt_injections") &&
        sql.includes("(task_id, session_id, prompt_text, prompt_hash, actor_token_hash, created_at)")
      ) {
        return {
          run: (
            taskId: string,
            sessionId: string,
            promptText: string,
            promptHash: string,
            actorTokenHash: string | null,
            createdAt: number,
          ) => {
            const nextId = state.nextInterruptInjectionId++;
            state.interruptInjections.push({
              id: nextId,
              task_id: taskId,
              session_id: sessionId,
              prompt_text: promptText,
              prompt_hash: promptHash,
              actor_token_hash: actorTokenHash,
              created_at: createdAt,
              consumed_at: null,
            });
            return { changes: 1, lastInsertRowid: nextId };
          },
          get: () => undefined,
          all: () => [],
        };
      }
      if (
        sql.startsWith("SELECT COUNT(*) AS cnt FROM task_interrupt_injections WHERE task_id = ? AND session_id = ?")
      ) {
        return {
          get: (taskId: string, sessionId: string) => ({
            cnt: state.interruptInjections.filter(
              (row) => row.task_id === taskId && row.session_id === sessionId && row.consumed_at == null,
            ).length,
          }),
          all: () => [],
          run: () => ({ changes: 0 }),
        };
      }
      return {
        get: () => undefined,
        all: () => [],
        run: () => ({ changes: 0 }),
      };
    },
  };
}

function createDeps(seed?: {
  task?: Partial<TaskRow>;
  agent?: Partial<AgentRow>;
  activePid?: number | null;
  sessionId?: string | null;
}): {
  deps: TaskExecutionControlRouteDeps;
  routes: Map<string, (req: any, res: any) => any>;
  state: FakeDbState;
  spies: {
    interruptPidTree: ReturnType<typeof vi.fn>;
    killPidTree: ReturnType<typeof vi.fn>;
    rollbackTaskWorktree: ReturnType<typeof vi.fn>;
    clearTaskWorkflowState: ReturnType<typeof vi.fn>;
    endTaskExecutionSession: ReturnType<typeof vi.fn>;
    appendTaskLog: ReturnType<typeof vi.fn>;
    notifyCeo: ReturnType<typeof vi.fn>;
    startTaskExecutionForAgent: ReturnType<typeof vi.fn>;
    randomDelay: ReturnType<typeof vi.fn>;
    ensureTaskExecutionSession: ReturnType<typeof vi.fn>;
  };
  maps: {
    activeProcesses: Map<string, { pid: number; kill: () => void }>;
    stopRequestedTasks: Set<string>;
    stopRequestModeByTask: Map<string, "pause" | "cancel">;
    taskExecutionSessions: Map<string, { sessionId: string; agentId?: string; provider?: string }>;
  };
} {
  const taskId = "task-1";
  const agentId = "agent-1";
  const state: FakeDbState = {
    tasks: new Map([
      [
        taskId,
        {
          id: taskId,
          title: "QA stop/resume test",
          status: "in_progress",
          assigned_agent_id: agentId,
          department_id: "qa",
          updated_at: 1000,
          ...seed?.task,
        },
      ],
    ]),
    agents: new Map([
      [
        agentId,
        {
          id: agentId,
          status: "running",
          department_id: "qa",
          current_task_id: taskId,
          ...seed?.agent,
        },
      ],
    ]),
    linkedSubtasksByDelegatedTask: new Map(),
    interruptInjections: [],
    nextInterruptInjectionId: 1,
  };

  const routes = new Map<string, (req: any, res: any) => any>();
  const app = {
    post(path: string, handler: (req: any, res: any) => any) {
      routes.set(path, handler);
    },
  };

  const interruptPidTree = vi.fn();
  const killPidTree = vi.fn();
  const rollbackTaskWorktree = vi.fn(() => true);
  const clearTaskWorkflowState = vi.fn();
  const endTaskExecutionSession = vi.fn();
  const appendTaskLog = vi.fn();
  const notifyCeo = vi.fn();
  const startTaskExecutionForAgent = vi.fn();
  const randomDelay = vi.fn(() => 0);

  const activeProcesses = new Map<string, { pid: number; kill: () => void }>();
  if (typeof seed?.activePid === "number") {
    activeProcesses.set(taskId, { pid: seed.activePid, kill: vi.fn() });
  }

  const stopRequestedTasks = new Set<string>();
  const stopRequestModeByTask = new Map<string, "pause" | "cancel">();
  const taskExecutionSessions = new Map<string, { sessionId: string; agentId?: string; provider?: string }>();
  if (seed?.sessionId) {
    taskExecutionSessions.set(taskId, { sessionId: seed.sessionId });
  }
  const ensureTaskExecutionSession = vi.fn((taskIdInput: string, agentIdInput: string, provider: string) => {
    const existing = taskExecutionSessions.get(taskIdInput);
    if (existing?.sessionId) return existing;
    const created = { sessionId: `session-auto-${taskIdInput}`, agentId: agentIdInput, provider };
    taskExecutionSessions.set(taskIdInput, created);
    return created;
  });

  const deps: TaskExecutionControlRouteDeps = {
    app: app as any,
    db: createFakeDb(state) as any,
    nowMs: () => 123456,
    resolveLang: () => "en",
    stopProgressTimer: vi.fn(),
    activeProcesses: activeProcesses as any,
    rollbackTaskWorktree,
    clearTaskWorkflowState,
    endTaskExecutionSession,
    broadcast: vi.fn(),
    notifyCeo,
    pickL: (bundle: any, lang: string) => bundle[lang] ?? bundle.en ?? bundle.ko,
    l: (ko: string[], en: string[], ja: string[], zh: string[]) => ({ ko, en, ja, zh }),
    stopRequestedTasks,
    stopRequestModeByTask,
    interruptPidTree,
    killPidTree,
    appendTaskLog,
    delegatedTaskToSubtask: new Map(),
    subtaskDelegationCallbacks: new Map(),
    crossDeptNextCallbacks: new Map(),
    subtaskDelegationDispatchInFlight: new Set(),
    subtaskDelegationCompletionNoticeSent: new Set(),
    taskExecutionSessions,
    ensureTaskExecutionSession,
    getDeptName: () => "QA/QC",
    isTaskWorkflowInterrupted: () => false,
    startTaskExecutionForAgent,
    randomDelay,
  };

  return {
    deps,
    routes,
    state,
    spies: {
      interruptPidTree,
      killPidTree,
      rollbackTaskWorktree,
      clearTaskWorkflowState,
      endTaskExecutionSession,
      appendTaskLog,
      notifyCeo,
      startTaskExecutionForAgent,
      randomDelay,
      ensureTaskExecutionSession,
    },
    maps: {
      activeProcesses,
      stopRequestedTasks,
      stopRequestModeByTask,
      taskExecutionSessions,
    },
  };
}

describe("registerTaskExecutionControlRoutes", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("pause 요청 시 active pid에 interrupt를 보내고 pending으로 전환한다", () => {
    const harness = createDeps({ activePid: 4321 });
    registerTaskExecutionControlRoutes(harness.deps);

    const handler = harness.routes.get("/api/tasks/:id/stop");
    expect(handler).toBeTypeOf("function");

    const req = {
      params: { id: "task-1" },
      body: { mode: "pause" },
      query: {},
      method: "POST",
      header: (name: string) => (name.toLowerCase() === "x-csrf-token" ? getCsrfToken() : undefined),
    };
    const res = createFakeRes();
    handler?.(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      stopped: true,
      status: "pending",
      pid: 4321,
      rolled_back: false,
      interrupt: {
        session_id: expect.any(String),
        control_token: expect.any(String),
        requires_csrf: true,
      },
    });
    const payload = res.payload as {
      interrupt?: { session_id: string; control_token: string } | null;
    };
    expect(payload.interrupt).toBeTruthy();
    expect(payload.interrupt?.control_token).toBe(
      buildTaskInterruptControlToken("task-1", String(payload.interrupt?.session_id ?? "")),
    );
    expect(harness.state.tasks.get("task-1")?.status).toBe("pending");
    expect(harness.maps.stopRequestedTasks.has("task-1")).toBe(true);
    expect(harness.maps.stopRequestModeByTask.get("task-1")).toBe("pause");
    expect(harness.spies.interruptPidTree).toHaveBeenCalledWith(4321);
    expect(harness.spies.killPidTree).not.toHaveBeenCalled();
    expect(harness.spies.rollbackTaskWorktree).not.toHaveBeenCalled();
    expect(harness.spies.clearTaskWorkflowState).not.toHaveBeenCalled();
    expect(harness.spies.endTaskExecutionSession).not.toHaveBeenCalled();
    expect(harness.spies.appendTaskLog).toHaveBeenCalledWith(
      "task-1",
      "system",
      "PAUSE_BREAK sent to pid 4321 (graceful interrupt, session_kept=true)",
    );
  });

  it("cancel 요청 시 kill과 rollback/정리를 수행한다", () => {
    const harness = createDeps({ activePid: 9876 });
    registerTaskExecutionControlRoutes(harness.deps);

    const handler = harness.routes.get("/api/tasks/:id/stop");
    const req = {
      params: { id: "task-1" },
      body: { mode: "cancel" },
      query: {},
      method: "POST",
      header: (name: string) => (name.toLowerCase() === "x-csrf-token" ? getCsrfToken() : undefined),
    };
    const res = createFakeRes();
    handler?.(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      stopped: true,
      status: "cancelled",
      pid: 9876,
      rolled_back: true,
    });
    expect(harness.state.tasks.get("task-1")?.status).toBe("cancelled");
    expect(harness.maps.stopRequestModeByTask.get("task-1")).toBe("cancel");
    expect(harness.spies.interruptPidTree).not.toHaveBeenCalled();
    expect(harness.spies.killPidTree).toHaveBeenCalledWith(9876);
    expect(harness.spies.rollbackTaskWorktree).toHaveBeenCalledWith("task-1", "stop_cancelled");
    expect(harness.spies.clearTaskWorkflowState).toHaveBeenCalledWith("task-1");
    expect(harness.spies.endTaskExecutionSession).toHaveBeenCalledWith("task-1", "stop_cancelled");
  });

  it("cancel 요청 시 음수 pid는 child.kill fallback을 사용한다", () => {
    const harness = createDeps({ activePid: -9 });
    registerTaskExecutionControlRoutes(harness.deps);

    const handler = harness.routes.get("/api/tasks/:id/stop");
    const req = {
      params: { id: "task-1" },
      body: { mode: "cancel" },
      query: {},
      method: "POST",
      header: (name: string) => (name.toLowerCase() === "x-csrf-token" ? getCsrfToken() : undefined),
    };
    const res = createFakeRes();
    handler?.(req, res);

    expect(res.statusCode).toBe(200);
    const child = harness.maps.activeProcesses.get("task-1");
    expect(child?.kill).toHaveBeenCalledTimes(1);
    expect(harness.spies.killPidTree).not.toHaveBeenCalled();
    expect(harness.spies.interruptPidTree).not.toHaveBeenCalled();
  });

  it("pending 상태 재개 시 auto resume을 예약하고 기존 session_id를 반환한다", () => {
    vi.useFakeTimers();
    const harness = createDeps({
      task: { status: "pending" },
      agent: { status: "idle" },
      activePid: null,
      sessionId: "session-qa-1",
    });
    registerTaskExecutionControlRoutes(harness.deps);

    const handler = harness.routes.get("/api/tasks/:id/resume");
    const req = {
      params: { id: "task-1" },
      body: {},
      query: {},
      method: "POST",
      header: (name: string) => (name.toLowerCase() === "x-csrf-token" ? getCsrfToken() : undefined),
    };
    const res = createFakeRes();
    handler?.(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      ok: true,
      status: "planned",
      auto_resumed: true,
      session_id: "session-qa-1",
    });
    expect(harness.state.tasks.get("task-1")?.status).toBe("planned");
    expect(harness.spies.appendTaskLog).toHaveBeenCalledWith(
      "task-1",
      "system",
      "RESUME auto-run scheduled (session=session-qa-1)",
    );

    vi.runAllTimers();
    expect(harness.spies.startTaskExecutionForAgent).toHaveBeenCalledTimes(1);
    expect(harness.spies.startTaskExecutionForAgent).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({ id: "agent-1" }),
      "qa",
      "QA/QC",
    );
  });

  it("pause -> inject -> resume 통합 흐름이 순차 처리된다", () => {
    vi.useFakeTimers();
    const sessionId = "session-qa-inject";
    const harness = createDeps({ activePid: 5678, sessionId, agent: { status: "idle" } });
    registerTaskExecutionControlRoutes(harness.deps);

    const stopHandler = harness.routes.get("/api/tasks/:id/stop");
    const injectHandler = harness.routes.get("/api/tasks/:id/inject");
    const resumeHandler = harness.routes.get("/api/tasks/:id/resume");
    expect(stopHandler).toBeTypeOf("function");
    expect(injectHandler).toBeTypeOf("function");
    expect(resumeHandler).toBeTypeOf("function");

    const interruptToken = buildTaskInterruptControlToken("task-1", sessionId);

    const stopReq = {
      params: { id: "task-1" },
      body: {
        mode: "pause",
        session_id: sessionId,
        interrupt_token: interruptToken,
      },
      query: {},
      method: "POST",
      header: (name: string) => {
        const key = name.toLowerCase();
        if (key === "x-csrf-token") return getCsrfToken();
        return undefined;
      },
    };
    const stopRes = createFakeRes();
    stopHandler?.(stopReq, stopRes);
    expect(stopRes.statusCode).toBe(200);
    expect(harness.state.tasks.get("task-1")?.status).toBe("pending");

    const injectReq = {
      params: { id: "task-1" },
      body: {
        session_id: sessionId,
        interrupt_token: interruptToken,
        prompt: "Run tests first, then continue.",
      },
      query: {},
      method: "POST",
      header: (name: string) => {
        const key = name.toLowerCase();
        if (key === "x-csrf-token") return getCsrfToken();
        return undefined;
      },
    };
    const injectRes = createFakeRes();
    injectHandler?.(injectReq, injectRes);

    expect(injectRes.statusCode).toBe(200);
    expect(injectRes.payload).toMatchObject({
      ok: true,
      queued: true,
      session_id: sessionId,
      pending_count: 1,
    });
    expect(harness.state.interruptInjections).toHaveLength(1);
    expect(harness.state.interruptInjections[0]?.prompt_text).toBe("Run tests first, then continue.");

    harness.maps.activeProcesses.delete("task-1");
    const resumeReq = {
      params: { id: "task-1" },
      body: {},
      query: {},
      method: "POST",
      header: (name: string) => {
        const key = name.toLowerCase();
        if (key === "x-csrf-token") return getCsrfToken();
        return undefined;
      },
    };
    const resumeRes = createFakeRes();
    resumeHandler?.(resumeReq, resumeRes);
    expect(resumeRes.statusCode).toBe(200);
    expect(resumeRes.payload).toMatchObject({
      ok: true,
      status: "planned",
      auto_resumed: true,
      session_id: sessionId,
    });
    expect(harness.state.tasks.get("task-1")?.status).toBe("planned");
    vi.runAllTimers();
    expect(harness.spies.startTaskExecutionForAgent).toHaveBeenCalledTimes(1);
  });
});
