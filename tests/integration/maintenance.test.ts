/**
 * Limpeza de arquivos órfãos: só remove o que não tem vínculo e tem mais de 24 h.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cleanupOrphanUploads } from "@/modules/files/service";

const enabled = Boolean(process.env.DATABASE_URL);
const NOW = new Date();
const OLD = new Date(NOW.getTime() - 3 * 86_400_000);

describe.skipIf(!enabled)("limpeza de comprovantes órfãos (integração)", () => {
  it("remove registro sem vínculo e arquivo sem registro, antigos; preserva o resto", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "caixinha-orfaos-"));
    const userId = randomUUID();
    await db.user.create({ data: { id: userId, name: "Envio", email: `${userId.slice(0, 8)}@orfao.local` } });

    const mk = async (createdAt: Date) => {
      const storageKey = `${randomUUID()}.pdf`;
      await writeFile(path.join(dir, storageKey), "%PDF-1.4 teste");
      const row = await db.fileUpload.create({
        data: {
          storageKey,
          fileName: "c.pdf",
          contentType: "application/pdf",
          sizeBytes: 14,
          sha256: "x",
          uploadedById: userId,
        },
      });
      await db.fileUpload.update({ where: { id: row.id }, data: { createdAt } });
      return row;
    };
    const oldOrphan = await mk(OLD);
    const recentOrphan = await mk(NOW);
    // Arquivos no disco sem registro no banco: um antigo (removido) e um recente (mantido).
    const strayOld = `${randomUUID()}.png`;
    const strayNew = `${randomUUID()}.png`;
    await writeFile(path.join(dir, strayOld), "x");
    await writeFile(path.join(dir, strayNew), "x");
    await utimes(path.join(dir, strayOld), OLD, OLD);
    await writeFile(path.join(dir, "leia-me.txt"), "não é comprovante"); // nome fora do padrão: ignorado
    await utimes(path.join(dir, "leia-me.txt"), OLD, OLD);

    const result = await cleanupOrphanUploads(NOW, dir);
    expect(result.files).toBe(1);
    expect(result.records).toBeGreaterThanOrEqual(1);

    expect(await db.fileUpload.findUnique({ where: { id: oldOrphan.id } })).toBeNull();
    expect(await db.fileUpload.findUnique({ where: { id: recentOrphan.id } })).not.toBeNull();
    const left = await readdir(dir);
    expect(left).not.toContain(oldOrphan.storageKey);
    expect(left).not.toContain(strayOld);
    expect(left).toEqual(expect.arrayContaining([recentOrphan.storageKey, strayNew, "leia-me.txt"]));
  });

  it("nunca remove arquivo vinculado a pagamento", async () => {
    const linked = await db.fileUpload.findFirst({ where: { payments: { some: {} } } });
    if (!linked) return; // depende de outro teste ter enviado comprovante
    await db.fileUpload.update({ where: { id: linked.id }, data: { createdAt: OLD } });
    await cleanupOrphanUploads(NOW, await mkdtemp(path.join(tmpdir(), "caixinha-orfaos-")));
    expect(await db.fileUpload.findUnique({ where: { id: linked.id } })).not.toBeNull();
  });
});
