import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl, E2E_BASE_URL, E2E_PORT } from "./e2e/env";

const channel = process.env.E2E_CHANNEL ?? "chrome";

/**
 * Testes de ponta a ponta contra o BUILD DE PRODUÇÃO (CSP real, sem 'unsafe-eval'),
 * em um banco exclusivo (caixinha_e2e), esvaziado e populado a cada execução.
 * Usa o Chrome instalado na máquina (E2E_CHANNEL=msedge para o Edge) — nenhum navegador é baixado.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: E2E_BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    command: `npm run build && npx next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      BETTER_AUTH_URL: E2E_BASE_URL,
      ADMIN_2FA_REQUIRED: "true",
      PIX_PROVIDER: "simulated",
    },
  },
});
