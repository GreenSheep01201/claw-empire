import React, { useEffect, useState } from "react";
import { Task, TaskStatus } from "../../types";
import { timeAgo } from "../taskboard/constants";

type Props = {
  task: Task;
  localeTag: string;
  onStatusChange: (id: string, status: TaskStatus) => void;
};

const STEP_KEYS = [
  "file_created",
  "props_typing",
  "jsx_implemented",
  "styling_done",
  "git_committed",
] as const;

export const ComponentTaskCard: React.FC<Props> = ({
  task,
  localeTag,
  onStatusChange,
}) => {
  const key = `comp-steps-${task.id}`;
  const [checked, setChecked] = useState<boolean[]>(
    () =>
      JSON.parse(localStorage.getItem(key) || "null") ??
      new Array(STEP_KEYS.length).fill(false)
  );

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(checked));
  }, [checked, key]);

  const toggle = (index: number) => {
    setChecked((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const filename = task.title.replace(/^\[コンポーネント\]\s*/, "");

  const completedCount = checked.filter(Boolean).length;
  const progress = Math.round((completedCount / STEP_KEYS.length) * 100);

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as TaskStatus;
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      onStatusChange(task.id, newStatus);
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  return (
    <div className="border rounded p-4 shadow-sm bg-white">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xl font-semibold">{filename}</h3>
          <p className="text-sm text-gray-500">{task.project_path ?? ""}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">担当: {task.assigned_agent_id ? task.assigned_agent_id.slice(0, 8) : "未割当"}</div>
          <div className="text-sm text-gray-600">{timeAgo(task.updated_at, localeTag)}</div>
        </div>
      </div>

      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700">ステータス</label>
        <select
          value={task.status}
          onChange={handleStatusChange}
          className="mt-1 block w-full border rounded px-2 py-1"
        >
          <option value="coding">coding</option>
          <option value="component_dev">component_dev</option>
          <option value="done">done</option>
        </select>
      </div>

      <div className="mt-3">
        <div className="w-full bg-gray-200 rounded h-2">
          <div
            className="bg-blue-500 h-2 rounded"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-sm text-gray-600 mt-1">{completedCount} / {STEP_KEYS.length} completed</div>
      </div>

      <ul className="mt-3 space-y-2">
        {[
          "ファイル作成",
          "Props型定義",
          "JSX実装",
          "スタイリング",
          "gitコミット",
        ].map((label, idx) => (
          <li key={label} className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={!!checked[idx]}
              onChange={() => toggle(idx)}
              id={`${task.id}-step-${idx}`}
              className="w-4 h-4"
            />
            <label htmlFor={`${task.id}-step-${idx}`} className="text-sm">
              {label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ComponentTaskCard;
