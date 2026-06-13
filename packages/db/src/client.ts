import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: pg.Pool | null = null;

export function createDb(connectionString: string): Database {
  pool ??= new pg.Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema });
}

export async function pingDb(connectionString: string): Promise<boolean> {
  const p = pool ?? new pg.Pool({ connectionString, max: 1 });
  pool ??= p;
  try {
    await p.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
