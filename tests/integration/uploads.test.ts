/**
 * Comprovantes: tipo verificado pelo CONTEÚDO, limite de tamanho, nome saneado
 * e leitura restrita à pasta de uploads.
 */
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { detectFileType, MAX_UPLOAD_BYTES, readUpload, saveUpload } from "@/modules/files/service";

const enabled = Boolean(process.env.DATABASE_URL);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("detecção de tipo pelo conteúdo", () => {
  it("reconhece PDF e PNG verdadeiros", () => {
    expect(detectFileType(PDF)?.type).toBe("application/pdf");
    expect(detectFileType(PNG)?.type).toBe("image/png");
  });

  it("não confia na extensão: HTML disfarçado de .pdf é recusado", () => {
    expect(detectFileType(Buffer.from("<html><script>alert(1)</script></html>"))).toBeNull();
  });
});

describe.skipIf(!enabled)("gravação de comprovantes", () => {
  const userId = randomUUID();
  const saved: string[] = [];

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Uploader", email: `up.${userId.slice(0, 6)}@teste.local` } });
  });

  afterAll(async () => {
    await Promise.all(saved.map((key) => rm(path.join(process.cwd(), "storage", "uploads", key), { force: true })));
  });

  it("grava PDF válido com hash e nome saneado, e lê de volta", async () => {
    const file = new File([PDF], "../../comprovante<script>.pdf", { type: "text/html" });
    const upload = await saveUpload(file, userId);
    expect(upload).not.toBeNull();
    saved.push(upload!.storageKey);
    expect(upload!.contentType).toBe("application/pdf"); // tipo real, não o declarado
    expect(upload!.fileName).not.toMatch(/[<>/]/);
    expect(upload!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await readUpload(upload!.storageKey)).equals(PDF)).toBe(true);
  });

  it("sem arquivo enviado → nada é gravado", async () => {
    expect(await saveUpload(new File([], ""), userId)).toBeNull();
    expect(await saveUpload(null, userId)).toBeNull();
  });

  it("recusa formato não aceito e arquivo acima de 5 MB", async () => {
    await expect(saveUpload(new File(["texto"], "a.pdf"), userId)).rejects.toThrow(DomainError);
    const big = new File([Buffer.concat([PDF, Buffer.alloc(MAX_UPLOAD_BYTES)])], "grande.pdf");
    await expect(saveUpload(big, userId)).rejects.toThrow(/5 MB/);
  });

  it("leitura não escapa da pasta de uploads", async () => {
    await expect(readUpload("../../.env")).rejects.toThrow(DomainError);
  });
});
