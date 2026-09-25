import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Lazy singleton so `next build` and Vitest never need DATABASE_URL at
 * import time — only when a query actually runs.
 */
let dbInstance: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (dbInstance) return dbInstance;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = neon(url);
  dbInstance = drizzle({ client, schema });
  return dbInstance;
}
