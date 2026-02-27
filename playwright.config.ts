import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: process.env.PW_BASE_URL ?? "http://127.0.0.1:8810",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:e2e",
    url: "http://127.0.0.1:8810",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  reporter: process.env.CI ? [["github"]] : [["list"]],
  retries: process.env.CI ? 1 : 0,
});
