/**
 * Controle de permissões (RBAC) — fonte única da verdade.
 *
 * Este módulo é puro: recebe o "ator" e responde se a ação é permitida.
 * Toda Server Action / Route Handler deve chamar `requirePermission` (session.ts),
 * que usa estas funções. A interface apenas ESCONDE botões; quem decide é o servidor.
 */

export const ROLES = ["ADMIN", "PARTICIPANT"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // Administrador
  "participants.manage",
  "cycles.manage",
  "quotas.manage",
  "payments.register",
  "payments.confirm",
  "expenses.manage",
  "revenues.manage",
  "fundraising.manage",
  "results.calculate",
  "results.approve",
  "adminFee.configure",
  "reports.consolidated",
  "cycles.close",
  "users.manage",
  "audit.read",
  "compliance.decide",
  "ledger.read",
  "dashboard.admin",
  "announcements.manage",
  // Participante (sempre restrito aos PRÓPRIOS dados)
  "self.dashboard",
  "self.statement",
  "self.receipts",
  "self.payments.inform",
  "self.profile.update",
  "self.rules.accept",
  // Ambos
  "reports.collective",
  "announcements.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const SELF_PERMISSIONS: readonly Permission[] = [
  "self.dashboard",
  "self.statement",
  "self.receipts",
  "self.payments.inform",
  "self.profile.update",
  "self.rules.accept",
];

const SHARED_PERMISSIONS: readonly Permission[] = ["reports.collective", "announcements.read"];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  "participants.manage",
  "cycles.manage",
  "quotas.manage",
  "payments.register",
  "payments.confirm",
  "expenses.manage",
  "revenues.manage",
  "fundraising.manage",
  "results.calculate",
  "results.approve",
  "adminFee.configure",
  "reports.consolidated",
  "cycles.close",
  "users.manage",
  "audit.read",
  "compliance.decide",
  "ledger.read",
  "dashboard.admin",
  "announcements.manage",
];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  // O administrador também pode ser participante; as permissões "self.*" valem
  // somente para o próprio cadastro de participante vinculado.
  ADMIN: new Set([...ADMIN_PERMISSIONS, ...SELF_PERMISSIONS, ...SHARED_PERMISSIONS]),
  PARTICIPANT: new Set([...SELF_PERMISSIONS, ...SHARED_PERMISSIONS]),
};

export type Actor = {
  userId: string;
  role: Role;
  status: "ACTIVE" | "SUSPENDED";
  /** Cadastro de participante vinculado ao usuário (se houver). */
  participantId: string | null;
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(actor: Actor | null, permission: Permission): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  return ROLE_PERMISSIONS[actor.role]?.has(permission) ?? false;
}

/**
 * Pode ver dados pessoais/financeiros INDIVIDUAIS do participante `targetParticipantId`?
 * - Administrador: sim.
 * - Participante: somente os próprios.
 */
export function canViewParticipant(actor: Actor | null, targetParticipantId: string): boolean {
  if (!actor || actor.status !== "ACTIVE") return false;
  if (hasPermission(actor, "participants.manage")) return true;
  return actor.participantId !== null && actor.participantId === targetParticipantId;
}

/**
 * Participantes nunca alteram dados financeiros, nem os próprios.
 * Permite apenas campos pessoais liberados (ex.: telefone).
 */
export const SELF_EDITABLE_FIELDS = ["phone"] as const;

export function canEditOwnField(actor: Actor | null, field: string): boolean {
  if (!hasPermission(actor, "self.profile.update")) return false;
  return (SELF_EDITABLE_FIELDS as readonly string[]).includes(field);
}
