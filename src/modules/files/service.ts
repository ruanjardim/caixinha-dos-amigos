import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, type DbTransaction } from "@/lib/db";
import { DomainError } from "@/lib/errors";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED: { type: string; ext: string; matches: (b: Buffer) => boolean }[] = [
  { type: "application/pdf", ext: "pdf", matches: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  {
    type: "image/png",
    ext: "png",
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: "image/jpeg", ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/webp",
    ext: "webp",
    matches: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export const ACCEPTED_UPLOADS = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export function storageDir() {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads");
}

/** Identifica o tipo REAL pelo conteúdo (não confia na extensão nem no navegador). */
export function detectFileType(bytes: Buffer) {
  return ALLOWED.find((a) => a.matches(bytes)) ?? null;
}

/**
 * Valida e grava um comprovante. Retorna null se nenhum arquivo foi enviado.
 * Arquivos ficam fora da pasta pública e só são servidos com verificação de permissão.
 */
export async function saveUpload(file: unknown, uploadedById: string, tx?: DbTransaction) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("O comprovante deve ter no máximo 5 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detectFileType(bytes);
  if (!kind) throw new DomainError("Formato não aceito. Envie PDF, PNG, JPG ou WEBP.");

  const storageKey = `${randomUUID()}.${kind.ext}`;
  await mkdir(storageDir(), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ storageDir(), storageKey), bytes, { flag: "wx" });

  const safeName = file.name.replace(/[^\w.\- ()À-ú]/g, "_").slice(0, 120) || `comprovante.${kind.ext}`;
  return (tx ?? db).fileUpload.create({
    data: {
      storageKey,
      fileName: safeName,
      contentType: kind.type,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      uploadedById,
    },
  });
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  // storageKey é gerado pelo sistema (UUID); ainda assim, impede escapar da pasta.
  if (!/^[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/.test(storageKey)) throw new DomainError("Arquivo inválido.");
  return readFile(path.join(storageDir(), storageKey));
}

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

async function removeFile(dir: string, storageKey: string) {
  try {
    await unlink(path.join(dir, storageKey));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/**
 * Remove comprovantes/imagens ÓRFÃOS com mais de 24 h (tarefa diária):
 * - registros sem vínculo com pagamento, lançamento ou atividade (o formulário falhou depois do envio);
 * - arquivos no disco sem registro no banco (gravação interrompida).
 * Arquivos vinculados nunca são tocados.
 */
export async function cleanupOrphanUploads(now: Date = new Date(), dir: string = storageDir()) {
  const cutoff = new Date(now.getTime() - ORPHAN_AGE_MS);
  const orphans = await db.fileUpload.findMany({
    where: { createdAt: { lt: cutoff }, payments: { none: {} }, ledger: { none: {} }, activityImages: { none: {} } },
    select: { id: true, storageKey: true },
  });
  for (const o of orphans) {
    // Exclui o registro só se continuar sem vínculo (proteção contra corrida com um envio em andamento).
    const removed = await db.fileUpload.deleteMany({
      where: { id: o.id, payments: { none: {} }, ledger: { none: {} }, activityImages: { none: {} } },
    });
    if (removed.count === 1) await removeFile(dir, o.storageKey);
  }

  let files = 0;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const candidates = names.filter((n) => /^[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/.test(n));
  if (candidates.length > 0) {
    const known = new Set(
      (await db.fileUpload.findMany({ where: { storageKey: { in: candidates } }, select: { storageKey: true } })).map(
        (f) => f.storageKey,
      ),
    );
    for (const name of candidates) {
      if (known.has(name)) continue;
      const info = await stat(path.join(dir, name));
      if (info.mtime < cutoff) {
        await removeFile(dir, name);
        files++;
      }
    }
  }
  return { records: orphans.length, files };
}
