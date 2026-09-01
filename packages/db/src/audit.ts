import { auditEvents } from "./schema";
import type { Db } from "./client";

/**
 * Fields that must never reach the audit log or application logs. Audit answers
 * "who touched what, when" — never "what did it say".
 */
const FORBIDDEN_METADATA_KEYS = new Set([
  "displayName",
  "display_name",
  "externalRef",
  "external_ref",
  "email",
  "beta",
  "value",
  "payload",
  "measurements",
]);

export interface AuditInput {
  orgId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

export class AuditMetadataLeakError extends Error {
  constructor(key: string) {
    super(`Refusing to write "${key}" into the audit log`);
    this.name = "AuditMetadataLeakError";
  }
}

export const assertNoSensitiveMetadata = (metadata: Record<string, unknown> | undefined): void => {
  if (!metadata) return;
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) throw new AuditMetadataLeakError(key);
  }
};

export async function recordAudit(db: Db, input: AuditInput): Promise<void> {
  assertNoSensitiveMetadata(input.metadata);
  await db.insert(auditEvents).values({
    orgId: input.orgId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  });
}
