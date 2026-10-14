import { describe, expect, it } from "vitest";
import { backupsToDelete } from "@/domain/backup-retention";

const NOW = new Date("2027-06-30T03:00:00Z");
const daily = (days: number) =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(NOW.getTime() - i * 86_400_000);
    return { name: `caixinha_${d.toISOString().slice(0, 10)}`, createdAt: d };
  });

describe("retenção de backups", () => {
  it("com poucos backups, não apaga nada", () => {
    expect(backupsToDelete(daily(5), NOW)).toEqual([]);
  });

  it("um ano de backups diários: mantém 7 diários + 4 semanais + 12 mensais (com sobreposição)", () => {
    const files = daily(400);
    const removed = backupsToDelete(files, NOW);
    const kept = files.length - removed.length;
    expect(kept).toBeGreaterThanOrEqual(12);
    expect(kept).toBeLessThanOrEqual(7 + 4 + 12);
    const keptNames = new Set(files.map((f) => f.name).filter((n) => !removed.some((r) => r.name === n)));
    // Os 7 mais recentes sempre ficam.
    for (const f of files.slice(0, 7)) expect(keptNames.has(f.name)).toBe(true);
    // Nada com mais de 13 meses fica.
    expect([...keptNames].some((n) => n < "caixinha_2026-05-01")).toBe(false);
  });

  it("é idempotente: aplicar de novo sobre o que restou não apaga mais nada", () => {
    const files = daily(200);
    const removed = new Set(backupsToDelete(files, NOW).map((f) => f.name));
    const rest = files.filter((f) => !removed.has(f.name));
    expect(backupsToDelete(rest, NOW)).toEqual([]);
  });
});
