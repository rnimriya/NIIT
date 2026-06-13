import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  NOTIFICATIONS_PORT: z.coerce.number().default(4007),
  DATABASE_URL: z.string().default("postgres://neet:neet@localhost:5432/neet"),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
  // Optional email provider — without it, email channel just logs.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("NEET AI <noreply@neet.ai>"),
  KAFKA_BROKERS: z.string().optional(),
});

export const config = Schema.parse(process.env);
export const emailEnabled = !!config.RESEND_API_KEY;
