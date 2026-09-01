"use server";

import { headers } from "next/headers";
import { createCheckoutSession } from "@/lib/billing";
import { requireOrg } from "@/lib/org";

export async function startCheckout(mode: "seats" | "report_pack") {
  const org = await requireOrg();
  if (org.role !== "owner") throw new Error("Only owners can manage billing");

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3100";
  const protocol = host.startsWith("localhost") ? "http" : "https";

  const session = await createCheckoutSession({
    orgId: org.orgId,
    orgName: org.orgName,
    mode,
    returnUrl: `${protocol}://${host}/settings`,
  });

  return { url: session.url };
}
