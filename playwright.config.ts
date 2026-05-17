import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.test.local first (test credentials), then .env.local (Supabase URL,
// SMTP, etc.) without overriding test creds.
loadEnv({ path: ".env.test.local" });
loadEnv({ path: ".env.local", override: false });

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // The e2e suite logs in with a user whose user_metadata is bloated to
    // force chunked auth cookies (see scripts/create-test-user.mjs). The
    // resulting request headers exceed Node's default 16 KB cap, which would
    // otherwise return 431 on every request. Raise it for the test server
    // only — production is unaffected.
    command: `NODE_OPTIONS=--max-http-header-size=65536 npm run dev -- --port ${PORT}`,
    url: `${BASE_URL}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
