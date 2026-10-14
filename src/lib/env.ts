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
  /** Segredo para assinar/verificar webhooks do provedor Pix (HMAC-SHA256). */
  PIX_WEBHOOK_SECRET: z.string().min(32, "PIX_WEBHOOK_SECRET deve ter ao menos 32 caracteres"),
  /** Modo manual: chave Pix DA CAIXINHA (conta da estrutura jurídica — nunca conta pessoal). Opcional. */
  PIX_MANUAL_KEY: z.string().trim().optional().default(""),
  PIX_MANUAL_RECEIVER_NAME: z.string().trim().optional().default(""),
  PIX_MANUAL_CITY: z.string().trim().optional().default(""),
  /** Segredo das tarefas agendadas (ex.: lembretes de vencimento). */
  CRON_SECRET: z.string().min(32, "CRON_SECRET deve ter ao menos 32 caracteres"),
  /** Verificação em duas etapas obrigatória para administradores (desligar SOMENTE em testes locais). */
  ADMIN_2FA_REQUIRED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Configuração inválida. Verifique o arquivo .env:\n${issues}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
