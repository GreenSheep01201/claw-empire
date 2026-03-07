import { useEffect, useState, useRef, useCallback } from "react";
import { Task } from "../../types";

type UseComponentTasksResult = {
  tasks: Task[];
  loading: boolean;
  refresh: () => void;
};

export const useComponentTasks = (): UseComponentTasksResult => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const intervalRef = useRef<number | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) {
        throw new Error("Failed to fetch tasks");
      }
      const data: Task[] = await res.json();
      const filtered = data.filter((t) =>
        t.title.startsWith("[コンポーネント]")
      );
      setTasks(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = window.setInterval(fetchTasks, 10000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    refresh: fetchTasks,
  };
};

export default useComponentTasks;
