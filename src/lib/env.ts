import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente validadas na inicialização.
 * Falha cedo (e com mensagem clara) se algo obrigatório estiver ausente.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET deve ter ao menos 32 caracteres"),
  BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  MAIL_FROM: z.string().default("Caixinha dos Amigos <nao-responda@exemplo.com>"),
  PIX_PROVIDER: z.enum(["manual", "simulated"]).default("simulated"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Configuração inválida. Verifique o arquivo .env:\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
