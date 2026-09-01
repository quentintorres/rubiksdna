import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { schema } from "@rubiksdna/db";
import type { Db } from "@rubiksdna/db";
import { serverEnv } from "./env";

/**
 * Neon over the websocket driver: withOrg() wraps every tenant query in a
 * transaction that sets the RLS org context, and interactive transactions
 * require the websocket (not http) driver.
 */
let cached: Db | null = null;

export function db(): Db {
  if (cached) return cached;
  const pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
  cached = drizzle(pool, { schema }) as unknown as Db;
  return cached;
}
