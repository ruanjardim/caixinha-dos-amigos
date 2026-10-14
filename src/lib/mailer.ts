import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { env, isProduction } from "@/lib/env";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Envia e-mail por SMTP quando configurado.
 * Em desenvolvimento, sem SMTP_HOST, grava a mensagem em ./.outbox
 * (nada é enviado para fora da máquina).
 */
export async function sendMail(message: MailMessage): Promise<void> {
  if (env.SMTP_HOST) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    await transport.sendMail({ from: env.MAIL_FROM, ...message });
    return;
  }

  if (isProduction) {
    throw new Error("SMTP não configurado: defina SMTP_HOST para enviar e-mails em produção.");
  }

  const dir = path.join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, "_");
  const file = path.join(dir, `${stamp}_${safeTo}.txt`);
  await writeFile(file, `Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`, "utf8");
  console.info(`[mailer] E-mail de desenvolvimento gravado em ${path.relative(process.cwd(), file)}`);
}
