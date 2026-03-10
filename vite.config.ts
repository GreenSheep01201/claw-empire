import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:8790";
const wsTarget = process.env.VITE_WS_PROXY_TARGET ?? apiTarget.replace(/^http/i, "ws");
const rawBasePath = process.env.VITE_BASE_PATH ?? "/";

const normalizeBasePath = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed || trimmed === "/") return "/";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
};

const appBasePath = normalizeBasePath(rawBasePath);
const appBasePrefix = appBasePath === "/" ? "" : appBasePath.slice(0, -1);

const escapeRegExp = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const rewriteBasePrefixedPath = (requestPath: string): string => {
  if (!appBasePrefix) return requestPath;
  return requestPath.replace(new RegExp(`^${escapeRegExp(appBasePrefix)}`), "") || "/";
};

type ProxyErrorResponse = ServerResponse<IncomingMessage> | Socket;
type ProxyLike = {
  on(event: "error", listener: (err: NodeJS.ErrnoException, req: IncomingMessage, res: ProxyErrorResponse) => void): void;
  on(event: "proxyReqWs", listener: (proxyReq: unknown, req: IncomingMessage, socket: Socket) => void): void;
};

const isServerResponse = (res: ProxyErrorResponse): res is ServerResponse<IncomingMessage> => {
  return typeof (res as ServerResponse<IncomingMessage>).writeHead === "function";
};

const silenceEpipe = (proxy: ProxyLike) => {
  proxy.on("error", (err: NodeJS.ErrnoException, _req, res) => {
    if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
    if (res && isServerResponse(res) && !res.headersSent) {
      res.writeHead(502);
      res.end();
    }
  });
  proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
    socket.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EPIPE" || err.code === "ECONNRESET") return;
    });
  });
};

const proxy: Record<string, {
  target: string;
  configure: typeof silenceEpipe;
  ws?: boolean;
  rewrite?: (requestPath: string) => string;
}> = {
  "/api": {
    target: apiTarget,
    configure: silenceEpipe,
  },
  "/ws": {
    target: wsTarget,
    ws: true,
    configure: silenceEpipe,
  },
};

if (appBasePrefix) {
  proxy[`${appBasePath}api`] = {
    target: apiTarget,
    configure: silenceEpipe,
    rewrite: rewriteBasePrefixedPath,
  };
  proxy[`${appBasePath}ws`] = {
    target: wsTarget,
    ws: true,
    configure: silenceEpipe,
    rewrite: rewriteBasePrefixedPath,
  };
}

const manualChunks = (id: string): string | undefined => {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("/node_modules/@pixi/")) {
    const match = id.match(/\/node_modules\/(@pixi\/[^/]+)\//);
    if (match) return `vendor-${match[1].replace("@pixi/", "pixi-")}`;
  }
  if (id.includes("/node_modules/pixi.js/")) return "vendor-pixi";
  if (id.includes("/node_modules/pptxgenjs/")) return "vendor-pptx";
  if (id.includes("/node_modules/react-router-dom/") || id.includes("/node_modules/react-router/")) return "vendor-router";
  if (id.includes("/node_modules/react-dom/") || id.includes("/node_modules/react/") || id.includes("/node_modules/scheduler/")) return "vendor-react";
  return undefined;
};

export default defineConfig({
  base: appBasePath,
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: [".ts.net"],
    watch: {
      ignored: ["**/.climpire-worktrees/**"],
    },
    proxy,
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
});
