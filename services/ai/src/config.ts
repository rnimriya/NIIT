import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  AI_PORT: z.coerce.number().default(4001),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof Schema>;

export const config: Config = Schema.parse(process.env);

export const hasAnthropic = !!config.ANTHROPIC_API_KEY;
export const hasOpenAI = !!config.OPENAI_API_KEY;
