import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { schema, withoutTenantScopeBecause, withOrg } from "@rubiksdna/db";
import { db } from "./db";
import { serverEnv } from "./env";
import { log } from "./log";

/**
 * Billing: per-seat base subscription plus report packs (credits). Usage is
 * metered locally in usage_events; report issuance decrements credits and is
 * blocked at zero for orgs past their pilot window.
 */

let stripeClient: Stripe | null = null;

export function stripe(): Stripe {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export async function meterUsage(orgId: string, kind: string, quantity = 1) {
  await withOrg(db(), orgId, async (tx) => {
    await tx.insert(schema.usageEvents).values({ orgId, kind, quantity });

    if (kind === "report_issued") {
      const [subscription] = await tx
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.orgId, orgId))
        .limit(1);
      if (subscription && subscription.plan !== "pilot") {
        if (subscription.reportCredits <= 0) {
          throw new Error(
            "No report credits remaining. Purchase a report pack in Settings → Billing.",
          );
        }
        await tx
          .update(schema.subscriptions)
          .set({ reportCredits: sql`${schema.subscriptions.reportCredits} - 1` })
          .where(eq(schema.subscriptions.orgId, orgId));
      }
    }
  });
}

export async function createCheckoutSession(input: {
  orgId: string;
  orgName: string;
  mode: "seats" | "report_pack";
  seats?: number;
  returnUrl: string;
}) {
  const env = serverEnv();
  const client = stripe();

  const [existing] = await withOrg(db(), input.orgId, (tx) =>
    tx.select().from(schema.subscriptions).where(eq(schema.subscriptions.orgId, input.orgId)).limit(1),
  );

  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      name: input.orgName,
      metadata: { orgId: input.orgId },
    });
    customerId = customer.id;
    await withOrg(db(), input.orgId, (tx) =>
      tx
        .insert(schema.subscriptions)
        .values({ orgId: input.orgId, stripeCustomerId: customerId!, plan: "pilot" })
        .onConflictDoNothing({ target: schema.subscriptions.orgId }),
    );
  }

  if (input.mode === "seats") {
    if (!env.STRIPE_PRICE_SEAT) throw new Error("STRIPE_PRICE_SEAT not configured");
    return client.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: env.STRIPE_PRICE_SEAT, quantity: input.seats ?? 1 }],
      success_url: `${input.returnUrl}?billing=success`,
      cancel_url: `${input.returnUrl}?billing=cancelled`,
      metadata: { orgId: input.orgId, kind: "seats" },
    });
  }

  if (!env.STRIPE_PRICE_REPORT_PACK) throw new Error("STRIPE_PRICE_REPORT_PACK not configured");
  return client.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: env.STRIPE_PRICE_REPORT_PACK, quantity: 1 }],
    success_url: `${input.returnUrl}?billing=success`,
    cancel_url: `${input.returnUrl}?billing=cancelled`,
    metadata: { orgId: input.orgId, kind: "report_pack" },
  });
}

/** Credits granted per report pack purchase. */
export const REPORT_PACK_SIZE = 25;

export async function handleStripeEvent(event: Stripe.Event) {
  const database = db();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId = session.metadata?.orgId;
      const kind = session.metadata?.kind;
      if (!orgId) return;

      await withoutTenantScopeBecause(database, "stripe webhook has no user session", async (d) => {
        if (kind === "report_pack") {
          await d
            .update(schema.subscriptions)
            .set({
              reportCredits: sql`${schema.subscriptions.reportCredits} + ${REPORT_PACK_SIZE}`,
            })
            .where(eq(schema.subscriptions.orgId, orgId));
        } else if (kind === "seats" && session.subscription) {
          await d
            .update(schema.subscriptions)
            .set({
              stripeSubscriptionId: String(session.subscription),
              plan: "standard",
              status: "active",
            })
            .where(eq(schema.subscriptions.orgId, orgId));
        }
      });
      log.info("stripe checkout completed", { orgId, kind });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await withoutTenantScopeBecause(database, "stripe webhook has no user session", (d) =>
        d
          .update(schema.subscriptions)
          .set({
            status: subscription.status,
            seats: subscription.items.data[0]?.quantity ?? 1,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          })
          .where(eq(schema.subscriptions.stripeSubscriptionId, subscription.id)),
      );
      break;
    }
    default:
      break;
  }
}
