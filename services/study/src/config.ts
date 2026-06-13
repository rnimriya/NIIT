import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  STUDY_PORT: z.coerce.number().default(4005),
  DATABASE_URL: z.string().default("postgres://neet:neet@localhost:5432/neet"),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
  AI_URL: z.string().default("http://localhost:4001"),
  PREDICTION_URL: z.string().default("http://localhost:4004"),
  PAYMENTS_URL: z.string().default("http://localhost:4006"),
});

export const config = Schema.parse(process.env);
