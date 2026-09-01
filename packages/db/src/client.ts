import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

/**
 * Any drizzle postgres database. Kept structural so the same helpers work
 * against Neon in production and PGlite in tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

export class MissingTenantContextError extends Error {
  constructor() {
    super("No organization context set. Use withOrg() for tenant-scoped queries.");
    this.name = "MissingTenantContextError";
  }
}

/**
 * Runs `fn` inside a transaction with `app.org_id` set, so row-level security
 * scopes every statement to that organization.
 *
 * The setting is transaction-local (`set local`), so it cannot leak to the
 * next user of a pooled connection.
 */
export async function withOrg<T>(db: Db, orgId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!orgId) throw new MissingTenantContextError();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.transaction(async (tx: any) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx as Db);
  });
}

/**
 * Escape hatch for operations that legitimately cross tenants: Stripe
 * webhooks, org provisioning, internal aggregate queries over the dataset.
 *
 * Deliberately verbose to name at the call site. Requires a connection whose
 * role bypasses RLS (see docs/phi-upgrade.md for role separation).
 */
export async function withoutTenantScopeBecause<T>(
  db: Db,
  reason: string,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  if (!reason || reason.length < 12) {
    throw new Error("withoutTenantScopeBecause requires a written justification");
  }
  return fn(db);
}
