/**
 * @file src/middleware/rbac.js
 * @description Minimal RBAC middleware for demo: checks Authorization header for role
 * @author Ren
 * @created 2026-03-07
 */

/**
 * @function requireRole
 * @description Returns express middleware that allows access only if Authorization header contains bearer token with role.
 * For demo purposes tokens:
 *  - "Bearer admin" => role "admin"
 *  - "Bearer user" => role "user"
 * In production replace with real auth (JWT/OAuth).
 * @param {string} role - required role, e.g. "admin"
 * @returns {Function} express middleware
 */
function requireRole(role) {
  return function (req, res, next) {
    const auth = req.headers["authorization"];
    if (!auth || typeof auth !== "string") {
      return res.status(401).json({ error: "unauthorized" });
    }
    const parts = auth.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ error: "unauthorized" });
    }
    const token = parts[1];
    // demo mapping
    const roleOf = token === "admin" ? "admin" : token === "user" ? "user" : null;
    if (!roleOf) return res.status(403).json({ error: "forbidden" });
    if (roleOf !== role) {
      return res.status(403).json({ error: "forbidden" });
    }
    // attach role info for downstream usage
    req.user = { role: roleOf };
    next();
  };
}

module.exports = { requireRole };
