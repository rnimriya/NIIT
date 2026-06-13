import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  AI_PORT: z.coerce.number().default(4001),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
});

export type Config = z.infer<typeof Schema>;

export const config: Config = Schema.parse(process.env);

export const hasAnthropic = !!config.ANTHROPIC_API_KEY;
export const hasOpenAI = !!config.OPENAI_API_KEY;

// Persistence is on only when DATABASE_URL is explicitly provided (compose),
// so the standalone `node dist/main.js` run stays DB-free and quiet.
export const databaseUrl = process.env.DATABASE_URL;
export const persistEnabled = !!databaseUrl;
