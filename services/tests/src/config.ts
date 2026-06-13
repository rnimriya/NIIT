import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  TESTS_PORT: z.coerce.number().default(4003),
  DATABASE_URL: z.string().default("postgres://neet:neet@localhost:5432/neet"),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
});

export const config = Schema.parse(process.env);
