// @ts-nocheck

import type { RuntimeContext, RouteCollabExports, RouteOpsExports } from "../types/runtime-context.ts";
import { registerRoutesPartA } from "./routes/core.ts";
import { registerRoutesPartB } from "./routes/collab.ts";
import { registerRoutesPartC } from "./routes/ops.ts";
import { ROUTE_RUNTIME_HELPER_KEYS } from "./runtime-helper-keys.ts";

export function registerApiRoutes(ctx: RuntimeContext): RouteCollabExports & RouteOpsExports {
  const runtime: RuntimeContext = ctx;


  Object.assign(runtime, registerRoutesPartB(runtime));
  Object.assign(runtime, registerRoutesPartA(runtime));
  Object.assign(runtime, registerRoutesPartC(runtime));

  const routeHelpers = Object.fromEntries(
    ROUTE_RUNTIME_HELPER_KEYS.map((key) => [key, runtime[key]])
  );

  return {
    DEPT_KEYWORDS: runtime.DEPT_KEYWORDS,
    ...routeHelpers,
  };
}
