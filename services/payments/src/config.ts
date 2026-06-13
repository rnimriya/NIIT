import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  PAYMENTS_PORT: z.coerce.number().default(4006),
  DATABASE_URL: z.string().default("postgres://neet:neet@localhost:5432/neet"),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
  // Optional Stripe config — when absent, checkout uses the dev-activation path.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PLUS: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  CHECKOUT_SUCCESS_URL: z.string().default("http://localhost:3000/upgrade?status=success"),
  CHECKOUT_CANCEL_URL: z.string().default("http://localhost:3000/upgrade?status=cancel"),
});

export const config = Schema.parse(process.env);
export const stripeEnabled = !!config.STRIPE_SECRET_KEY;
