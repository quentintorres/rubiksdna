import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/schema";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

/**
 * Boots an in-process Postgres with the real migrations and RLS policies,
 * then downgrades to a non-superuser role so row-level security is actually
 * enforced (superusers bypass RLS, which would make the test a lie).
 */
export async function createTestDatabase() {
  const pg = new PGlite();

  const migrationsDir = join(pkgRoot, "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (migrationFiles.length === 0) {
    throw new Error("No migrations found. Run `npm run db:generate` first.");
  }
  for (const file of migrationFiles) {
    const sqlText = readFileSync(join(migrationsDir, file), "utf8");
    // drizzle-kit separates statements with this breakpoint marker
    for (const statement of sqlText.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await pg.exec(trimmed);
    }
  }

  await pg.exec(readFileSync(join(pkgRoot, "sql", "rls.sql"), "utf8"));

  // Application role: full table privileges, but subject to RLS.
  await pg.exec(`
    create role app_user;
    grant usage on schema public to app_user;
    grant select, insert, update, delete on all tables in schema public to app_user;
    grant usage on all sequences in schema public to app_user;
  `);

  const db = drizzle(pg, { schema });

  return {
    pg,
    db,
    /** Run subsequent statements as the RLS-constrained application role. */
    actAsApp: () => pg.exec("set role app_user"),
    /** Return to superuser for fixture setup. */
    actAsAdmin: () => pg.exec("reset role"),
    close: () => pg.close(),
  };
}
