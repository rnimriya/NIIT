import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.string().default("development"),
  ANALYTICS_PORT: z.coerce.number().default(4008),
  JWT_DEV_SECRET: z.string().default("dev-only-change-me"),
  KAFKA_BROKERS: z.string().optional(),
  // ClickHouse is optional — without it analytics runs degraded (no sink/queries).
  CLICKHOUSE_URL: z.string().optional(),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
});

export const config = Schema.parse(process.env);
export const clickhouseEnabled = !!config.CLICKHOUSE_URL;
