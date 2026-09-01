import { z } from "zod";

/**
 * Environment contract. Everything the app needs is declared here once;
 * a missing variable fails fast with its name instead of surfacing as a
 * mystery further down.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  // R2 (S3-compatible)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  /** Region pin for storage and processing; PHI readiness requirement. */
  DATA_REGION: z.string().default("us-east-1"),
  // Jobs
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  /** Modal web endpoint for the Python analysis worker. */
  WORKER_URL: z.string().url().optional(),
  WORKER_SHARED_SECRET: z.string().optional(),
  // Billing
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_SEAT: z.string().optional(),
  STRIPE_PRICE_REPORT_PACK: z.string().optional(),
});

let cached: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing/invalid environment variables: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
