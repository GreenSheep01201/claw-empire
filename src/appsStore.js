/**
 * @file src/appsStore.js
 * @description In-memory apps store that manages app status and simulates start/stop operations
 * @author Ren
 * @created 2026-03-07
 */

const { randomUUID } = require("crypto");

/**
 * Internal representation:
 * Map<id, { id, name, status }>
 * status: "stopped" | "starting" | "running" | "stopping"
 */
const apps = new Map();

// Initialize demo apps
function _initDemo() {
  const demo = [
    { name: "claw-ui" },
    { name: "claw-api" },
    { name: "openclaw" },
  ];
  demo.forEach((d) => {
    const id = randomUUID();
    apps.set(id, { id, name: d.name, status: "stopped" });
  });
}

_initDemo();

/**
 * @function listApps
 * @description Return snapshot list of apps
 * @returns {Array<{id:string,name:string,status:string}>}
 */
function listApps() {
  return Array.from(apps.values()).map((a) => ({ ...a }));
}

/**
 * @function getAppStatus
 * @description Get status string for an app by id
 * @param {string} id
 * @returns {string|null}
 */
function getAppStatus(id) {
  const app = apps.get(id);
  return app ? app.status : null;
}

/**
 * @function startApp
 * @description Start an app. Implements idempotency and simulates asynchronous work.
 * - If already running, returns changed: false.
 * - If starting, returns changed: false (idempotent).
 * - If stopped, sets to starting, waits, then running.
 * @param {string} id
 * @returns {Promise<{id:string,status:string,changed:boolean}>}
 */
function startApp(id) {
  const app = apps.get(id);
  if (!app) return Promise.reject(new Error("not_found"));

  // Idempotency: if already running or starting, no-op
  if (app.status === "running") {
    return Promise.resolve({ id, status: "running", changed: false });
  }
  if (app.status === "starting") {
    return Promise.resolve({ id, status: "starting", changed: false });
  }

  // simulate start
  app.status = "starting";
  // return a promise that resolves when started
  return new Promise((resolve) => {
    // simulate variable startup time (200-800ms)
    const delay = 200 + Math.floor(Math.random() * 600);
    setTimeout(() => {
      app.status = "running";
      resolve({ id, status: "running", changed: true });
    }, delay);
  });
}

/**
 * @function stopApp
 * @description Stop an app. Implements idempotency and simulates asynchronous work.
 * @param {string} id
 * @returns {Promise<{id:string,status:string,changed:boolean}>}
 */
function stopApp(id) {
  const app = apps.get(id);
  if (!app) return Promise.reject(new Error("not_found"));

  if (app.status === "stopped") {
    return Promise.resolve({ id, status: "stopped", changed: false });
  }
  if (app.status === "stopping") {
    return Promise.resolve({ id, status: "stopping", changed: false });
  }

  app.status = "stopping";
  return new Promise((resolve) => {
    const delay = 150 + Math.floor(Math.random() * 500);
    setTimeout(() => {
      app.status = "stopped";
      resolve({ id, status: "stopped", changed: true });
    }, delay);
  });
}

module.exports = {
  listApps,
  getAppStatus,
  startApp,
  stopApp,
};
