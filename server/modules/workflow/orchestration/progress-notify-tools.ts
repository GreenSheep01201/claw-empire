type CreateProgressNotifyToolsDeps = Record<string, any>;

export function createProgressNotifyTools(deps: CreateProgressNotifyToolsDeps) {
  const { db, progressTimers, findTeamLeader, resolveLang, sendAgentMessage, pickL, l, randomUUID, nowMs, broadcast } =
    deps;

  function startProgressTimer(taskId: string, taskTitle: string, departmentId: string | null): void {
    // Send progress report every 5min for long-running tasks
    const timer = setInterval(() => {
      const currentTask = db.prepare("SELECT status FROM tasks WHERE id = ?").get(taskId) as
        | { status: string }
        | undefined;
      const ACTIVE_STATUSES = new Set([
        "in_progress", "coding", "testing", "documenting",
        "ui_work", "api_work", "component_dev", "debugging", "collaborating",
      ]);
      if (!currentTask || !ACTIVE_STATUSES.has(currentTask.status)) {
        clearInterval(timer);
        progressTimers.delete(taskId);
        return;
      }
      const leader = findTeamLeader(departmentId);
      if (leader) {
        const lang = resolveLang(taskTitle);
        sendAgentMessage(
          leader,
          pickL(
            l(
              [`대표님, '${taskTitle}' 작업 진행 중입니다. 현재 순조롭게 진행되고 있어요.`],
              [`CEO, '${taskTitle}' is in progress and currently going smoothly.`],
              [`CEO、'${taskTitle}' は進行中で、現在は順調です。`],
              [`CEO，'${taskTitle}' 正在进行中，目前进展顺利。`],
            ),
            lang,
          ),
          "report",
          "all",
          null,
          taskId,
        );
      }
    }, 300_000);
    progressTimers.set(taskId, timer);
  }

  function stopProgressTimer(taskId: string): void {
    const timer = progressTimers.get(taskId);
    if (timer) {
      clearInterval(timer);
      progressTimers.delete(taskId);
    }
  }

  // ---------------------------------------------------------------------------
  // Send CEO notification for all significant workflow events (B4)
  // ---------------------------------------------------------------------------
  function notifyCeo(content: string, taskId: string | null = null, messageType: string = "status_update"): void {
    const msgId = randomUUID();
    const t = nowMs();
    db.prepare(
      `INSERT INTO messages (id, sender_type, sender_id, receiver_type, receiver_id, content, message_type, task_id, created_at)
   VALUES (?, 'system', NULL, 'all', NULL, ?, ?, ?, ?)`,
    ).run(msgId, content, messageType, taskId, t);
    broadcast("new_message", {
      id: msgId,
      sender_type: "system",
      content,
      message_type: messageType,
      task_id: taskId,
      created_at: t,
    });
  }

  return {
    startProgressTimer,
    stopProgressTimer,
    notifyCeo,
  };
}
