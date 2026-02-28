import { useEffect, useRef, useCallback, useState } from "react";
import { bootstrapSession } from "../api";
import type { WSEvent, WSEventType } from "../types";

type Listener = (payload: unknown) => void;

const HEARTBEAT_INTERVAL = 25_000;
const HEARTBEAT_TIMEOUT = 10_000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<WSEventType, Set<Listener>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/ws`;
    let alive = true;
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let heartbeatInterval: ReturnType<typeof setInterval>;
    let heartbeatTimeout: ReturnType<typeof setTimeout>;
    let lastPong = Date.now();

    function clearHeartbeat() {
      clearInterval(heartbeatInterval);
      clearTimeout(heartbeatTimeout);
    }

    function startHeartbeat() {
      clearHeartbeat();
      lastPong = Date.now();
      heartbeatInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "ping" }));
        heartbeatTimeout = setTimeout(() => {
          if (Date.now() - lastPong > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
            ws?.close();
          }
        }, HEARTBEAT_TIMEOUT);
      }, HEARTBEAT_INTERVAL);
    }

    async function connect() {
      if (!alive) return;
      try {
        const bootstrapped = await bootstrapSession({ promptOnUnauthorized: false });
        if (!bootstrapped) {
          reconnectTimer = setTimeout(() => {
            void connect();
          }, 2000);
          return;
        }
      } catch {
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 2000);
        return;
      }
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (alive) {
          setConnected(true);
          startHeartbeat();
        }
      };
      ws.onclose = () => {
        if (!alive) return;
        clearHeartbeat();
        setConnected(false);
        reconnectTimer = setTimeout(() => {
          void connect();
        }, 2000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        if (!alive) return;
        lastPong = Date.now();
        clearTimeout(heartbeatTimeout);
        try {
          const evt: WSEvent = JSON.parse(e.data);
          if ((evt as any).type === "pong") return;
          const listeners = listenersRef.current.get(evt.type);
          if (listeners) {
            for (const fn of listeners) fn(evt.payload);
          }
        } catch {}
      };
    }

    void connect();
    return () => {
      alive = false;
      clearHeartbeat();
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const on = useCallback((type: WSEventType, fn: Listener) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(fn);
    return () => {
      listenersRef.current.get(type)?.delete(fn);
    };
  }, []);

  return { connected, on };
}
