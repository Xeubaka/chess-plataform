import { defineConfig } from "@playwright/test";

// Runs against a live `docker compose up` stack — the gateway is the only
// entry point clients (and this test) ever talk to, same as production.
export default defineConfig({
  testDir: "./golden-path",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8080",
    trace: "retain-on-failure"
  }
});
