/**
 * @file src/index.js
 * @description Express server exposing /health and apps start/stop/status APIs (demo)
 * @author Ren
 * @created 2026-03-07
 */

const express = require("express");
const bodyParser = require("body-parser");
const { listApps, getAppStatus, startApp, stopApp } = require("./appsStore");
const { requireRole } = require("./middleware/rbac");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(bodyParser.json());

/**
 * @function withTimeout
 * @description Wrap a promise with a timeout. Rejects with Error('timeout') when exceeded.
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - timeout in milliseconds
 * @returns {Promise}
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// List apps (no auth for demo)
app.get("/apps", (req, res) => {
  const apps = listApps();
  res.json({ apps });
});

// Get app status
app.get("/apps/:id/status", (req, res) => {
  const id = req.params.id;
  const status = getAppStatus(id);
  if (!status) {
    return res.status(404).json({ error: "not_found" });
  }
  res.json({ id, status });
});

// Start app (requires admin)
app.post(
  "/apps/:id/start",
  requireRole("admin"),
  async (req, res) => {
    const id = req.params.id;
    try {
      // enforce operation timeout (10s)
      const result = await withTimeout(startApp(id), 10000);
      // result: { id, status, changed }
      res.json(result);
    } catch (err) {
      if (err.message === "timeout") {
        return res.status(503).json({ error: "operation_timeout" });
      }
      if (err.message === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res.status(500).json({ error: "internal_error", message: err.message });
    }
  }
);

// Stop app (requires admin)
app.post(
  "/apps/:id/stop",
  requireRole("admin"),
  async (req, res) => {
    const id = req.params.id;
    try {
      const result = await withTimeout(stopApp(id), 10000);
      res.json(result);
    } catch (err) {
      if (err.message === "timeout") {
        return res.status(503).json({ error: "operation_timeout" });
      }
      if (err.message === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      res.status(500).json({ error: "internal_error", message: err.message });
    }
  }
);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`ClawEmpire Apps API listening on port ${PORT}`);
});
