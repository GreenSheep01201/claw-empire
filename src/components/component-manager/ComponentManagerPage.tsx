import React, { useMemo, useState } from "react";
import useComponentTasks from "./useComponentTasks";
import ComponentTaskCard from "./ComponentTaskCard";
import { Task, TaskStatus } from "../../types";

export const ComponentManagerPage: React.FC = () => {
  const { tasks, loading, refresh } = useComponentTasks();
  const [filter, setFilter] = useState<string>("all");
  const [localeTag] = useState<string>("ja");

  const filtered = useMemo(() => {
    if (filter === "all") return tasks;
    return tasks.filter((t) => t.status === (filter as TaskStatus));
  }, [tasks, filter]);

  const handleStatusChange = (id: string, status: TaskStatus) => {
    // optimistic update: refresh list after change
    refresh();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">コンポーネント管理</h1>
        <div>
          <button
            onClick={refresh}
            className="px-3 py-1 bg-gray-200 rounded"
          >
            更新
          </button>
        </div>
      </div>

      <div className="mb-4 flex space-x-2">
        <button
          className={`px-3 py-1 rounded ${filter === "coding" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
          onClick={() => setFilter("coding")}
        >
          coding
        </button>
        <button
          className={`px-3 py-1 rounded ${filter === "component_dev" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
          onClick={() => setFilter("component_dev")}
        >
          component_dev
        </button>
        <button
          className={`px-3 py-1 rounded ${filter === "done" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
          onClick={() => setFilter("done")}
        >
          done
        </button>
        <button
          className={`px-3 py-1 rounded ${filter === "all" ? "bg-blue-500 text-white" : "bg-gray-100"}`}
          onClick={() => setFilter("all")}
        >
          すべて
        </button>
      </div>

      {loading ? (
        <div>読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-600">該当するタスクがありません。</div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((t) => (
            <ComponentTaskCard
              key={t.id}
              task={t}
              localeTag={localeTag}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ComponentManagerPage;
