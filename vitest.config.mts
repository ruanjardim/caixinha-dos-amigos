import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Em testes, "server-only" vira um módulo vazio.
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    // Testes de integração compartilham o mesmo banco: rodar em série.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/modules/auth/permissions.ts"],
    },
  },
});
