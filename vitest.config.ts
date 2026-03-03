import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.dirname(fileURLToPath(new URL(import.meta.url)));

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.join(ROOT_DIR, "node_modules", "react"),
      "react-dom": path.join(ROOT_DIR, "node_modules", "react-dom"),
      "react/jsx-runtime": path.join(ROOT_DIR, "node_modules", "react", "jsx-runtime.js"),
      "react/jsx-dev-runtime": path.join(ROOT_DIR, "node_modules", "react", "jsx-dev-runtime.js"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["**/node_modules/**", "dist/**", "src/test/setup.ts"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["**/*.d.ts", "src/test/**", "src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
    },
  },
});
