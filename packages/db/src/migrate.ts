import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { join } from "node:path";

/** Applies pending migrations from packages/db/drizzle. Idempotent. */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  const db = drizzle(pool);
  // dist/migrate.js → ../drizzle holds the generated SQL
  await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
  await pool.end();
}

// Allow `node dist/migrate.js` as a standalone CLI (used in CI / pre-deploy job).
if (require.main === module) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log("migrations applied");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
