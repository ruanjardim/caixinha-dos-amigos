/**
 * Retenção de backups (avô-pai-filho), pura e testável:
 * mantém os backups dos últimos 7 dias, o mais recente de cada uma das últimas 4 semanas
 * e o mais recente de cada um dos últimos 12 meses. O resto pode ser apagado.
 */
export type BackupFile = { name: string; createdAt: Date };

const DAY = 86_400_000;

function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

export function backupsToDelete(
  files: readonly BackupFile[],
  now: Date,
  policy = { days: 7, weeks: 4, months: 12 },
): BackupFile[] {
  const sorted = [...files].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const keep = new Set<string>();

  for (const f of sorted) if (now.getTime() - f.createdAt.getTime() < policy.days * DAY) keep.add(f.name);

  const keepLatestPer = (keyOf: (d: Date) => string, limit: number) => {
    const seen = new Set<string>();
    for (const f of sorted) {
      const key = keyOf(f.createdAt);
      if (seen.has(key)) continue;
      if (seen.size >= limit) break;
      seen.add(key);
      keep.add(f.name);
    }
  };
  keepLatestPer(isoWeekKey, policy.weeks);
  keepLatestPer(monthKey, policy.months);

  return sorted.filter((f) => !keep.has(f.name));
}
