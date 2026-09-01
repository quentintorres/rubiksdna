import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { schema, withoutTenantScopeBecause } from "@rubiksdna/db";
import { db } from "./db";

export interface OrgContext {
  orgId: string;
  orgType: "research" | "clinic";
  phiEnabled: boolean;
  userId: string;
  role: "owner" | "analyst" | "clinician" | "viewer";
  orgName: string;
}

/**
 * Resolves the caller's Clerk session to our organization row, provisioning
 * the row on first sight. Everything downstream uses our uuid org id, which
 * is what RLS policies key on.
 */
export async function requireOrg(): Promise<OrgContext> {
  const { userId: clerkUserId, orgId: clerkOrgId, orgRole } = await auth();
  if (!clerkUserId) throw new Error("Not signed in");
  if (!clerkOrgId) throw new Error("No active organization. Create or select one first.");

  const database = db();

  const existing = await withoutTenantScopeBecause(
    database,
    "organization provisioning lookup by external auth id",
    (d) =>
      d
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.externalId, clerkOrgId))
        .limit(1),
  );

  let org = existing[0];
  if (!org) {
    const client = await clerkClient();
    const clerkOrg = await client.organizations.getOrganization({ organizationId: clerkOrgId });
    const [created] = await withoutTenantScopeBecause(
      database,
      "first-touch organization provisioning",
      (d) =>
        d
          .insert(schema.organizations)
          .values({ externalId: clerkOrgId, name: clerkOrg.name })
          .onConflictDoNothing({ target: schema.organizations.externalId })
          .returning(),
    );
    org =
      created ??
      (
        await withoutTenantScopeBecause(database, "organization provisioning re-read", (d) =>
          d
            .select()
            .from(schema.organizations)
            .where(eq(schema.organizations.externalId, clerkOrgId))
            .limit(1),
        )
      )[0];
  }
  if (!org) throw new Error("Organization provisioning failed");

  const users = await withoutTenantScopeBecause(
    database,
    "user provisioning lookup by external auth id",
    async (d) => {
      const found = await d
        .select()
        .from(schema.users)
        .where(eq(schema.users.externalId, clerkUserId))
        .limit(1);
      if (found.length > 0) return found;
      const client = await clerkClient();
      const clerkUser = await client.users.getUser(clerkUserId);
      return d
        .insert(schema.users)
        .values({
          externalId: clerkUserId,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? "unknown",
        })
        .onConflictDoNothing({ target: schema.users.externalId })
        .returning();
    },
  );
  const user = users[0];
  if (!user) throw new Error("User provisioning failed");

  const role =
    orgRole === "org:admin" ? "owner" : orgRole === "org:member" ? "analyst" : "viewer";

  return {
    orgId: org.id,
    orgType: org.type,
    phiEnabled: org.phiEnabled,
    userId: user.id,
    role,
    orgName: org.name,
  };
}
