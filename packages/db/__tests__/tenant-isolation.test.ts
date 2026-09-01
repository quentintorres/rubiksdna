import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "./helpers";
import { withOrg } from "../src/client";
import * as schema from "../src/schema";

let ctx: Awaited<ReturnType<typeof createTestDatabase>>;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  ctx = await createTestDatabase();

  // Fixtures are created as superuser (bypasses RLS, like a provisioning role).
  const [a] = await ctx.db
    .insert(schema.organizations)
    .values({ externalId: "clerk_org_a", name: "Alpha Clinic", type: "clinic" })
    .returning();
  const [b] = await ctx.db
    .insert(schema.organizations)
    .values({ externalId: "clerk_org_b", name: "Beta Research", type: "research" })
    .returning();
  orgA = a!.id;
  orgB = b!.id;

  // Everything after this point runs as the RLS-constrained application role.
  await ctx.actAsApp();
});

afterAll(async () => {
  await ctx.close();
});

describe("cross-tenant isolation (RLS)", () => {
  it("a tenant can read and write its own rows", async () => {
    await withOrg(ctx.db, orgA, async (tx) => {
      await tx.insert(schema.subjects).values({ orgId: orgA, externalRef: "A-001" });
    });

    const own = await withOrg(ctx.db, orgA, (tx) =>
      tx.select().from(schema.subjects),
    );
    expect(own).toHaveLength(1);
    expect(own[0]!.externalRef).toBe("A-001");
  });

  it("a tenant cannot read another tenant's rows", async () => {
    const stolen = await withOrg(ctx.db, orgB, (tx) =>
      tx.select().from(schema.subjects),
    );
    expect(stolen).toHaveLength(0);
  });

  it("a tenant cannot write rows into another tenant", async () => {
    await expect(
      withOrg(ctx.db, orgB, (tx) =>
        tx.insert(schema.subjects).values({ orgId: orgA, externalRef: "FORGED" }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("a query with no org context returns nothing", async () => {
    const rows = await ctx.db.select().from(schema.subjects);
    expect(rows).toHaveLength(0);
  });

  it("a tenant cannot see other organizations", async () => {
    const orgs = await withOrg(ctx.db, orgA, (tx) =>
      tx.select().from(schema.organizations),
    );
    expect(orgs).toHaveLength(1);
    expect(orgs[0]!.id).toBe(orgA);
  });

  it("a tenant cannot update another tenant's rows (0 rows affected)", async () => {
    const updated = await withOrg(ctx.db, orgB, (tx) =>
      tx
        .update(schema.subjects)
        .set({ externalRef: "HIJACKED" })
        .where(eq(schema.subjects.externalRef, "A-001"))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });
});

describe("PHI gate", () => {
  it("rejects identifiable fields while phi_enabled is false", async () => {
    await expect(
      withOrg(ctx.db, orgA, (tx) =>
        tx.insert(schema.subjects).values({
          orgId: orgA,
          externalRef: "A-002",
          displayName: "Jane Doe",
        }),
      ),
    ).rejects.toThrow(/phi_enabled/);
  });

  it("accepts identifiable fields once the organization opts in", async () => {
    await ctx.actAsAdmin();
    await ctx.db
      .update(schema.organizations)
      .set({ phiEnabled: true })
      .where(eq(schema.organizations.id, orgA));
    await ctx.actAsApp();

    await withOrg(ctx.db, orgA, (tx) =>
      tx.insert(schema.subjects).values({
        orgId: orgA,
        externalRef: "A-003",
        displayName: "Consented Subject",
      }),
    );

    // restore v1 posture
    await ctx.actAsAdmin();
    await ctx.db
      .update(schema.organizations)
      .set({ phiEnabled: false })
      .where(eq(schema.organizations.id, orgA));
    await ctx.actAsApp();
  });
});

describe("report immutability", () => {
  it("rejects edits to an issued report", async () => {
    const reportId = await withOrg(ctx.db, orgA, async (tx) => {
      const [subject] = await tx
        .insert(schema.subjects)
        .values({ orgId: orgA, externalRef: "A-REP" })
        .returning();
      const [sample] = await tx
        .insert(schema.samples)
        .values({
          orgId: orgA,
          subjectId: subject!.id,
          collectedAt: new Date("2026-01-15T00:00:00Z"),
          platform: "methylation_epic",
        })
        .returning();
      const [report] = await tx
        .insert(schema.reports)
        .values({
          orgId: orgA,
          subjectId: subject!.id,
          sampleId: sample!.id,
          objectKey: "reports/x.pdf",
          templateVersion: "1",
          disclaimerVersion: "2026-01-v1",
          clockVersions: {},
          pipelineVersion: "2026.08.0",
          payload: { hello: "world" },
        })
        .returning();
      return report!.id;
    });

    await expect(
      withOrg(ctx.db, orgA, (tx) =>
        tx
          .update(schema.reports)
          .set({ payload: { tampered: true } })
          .where(eq(schema.reports.id, reportId)),
      ),
    ).rejects.toThrow(/immutable/);
  });
});
