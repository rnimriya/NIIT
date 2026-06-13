import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import type { DomainEvent } from "@neet/events";
import { config, clickhouseEnabled } from "./config";

export interface TrackInput {
  type: string;
  actor?: string;
  source?: string;
  payload?: Record<string, unknown>;
}

// Ordered funnel stages we report on (whatever has been ingested).
const FUNNEL_STAGES = [
  "page_view",
  "signup",
  "TestScored",
  "plan_ready",
  "subscription_active",
] as const;

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly log = new Logger(AnalyticsService.name);
  private readonly ch: ClickHouseClient | null = clickhouseEnabled
    ? createClient({
        url: config.CLICKHOUSE_URL,
        username: config.CLICKHOUSE_USER,
        password: config.CLICKHOUSE_PASSWORD,
      })
    : null;

  onModuleInit(): void {
    if (!this.ch) {
      this.log.warn("ClickHouse disabled — analytics running degraded");
      return;
    }
    // Background, retrying — never block/crash boot on a transient CH hiccup.
    void this.ensureSchema();
  }

  private async ensureSchema(retries = 30): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.ch!.command({
          query: `
            CREATE TABLE IF NOT EXISTS events (
              event_id String,
              type LowCardinality(String),
              actor String,
              source LowCardinality(String),
              occurred_at DateTime64(3),
              payload String,
              ingested_at DateTime64(3) DEFAULT now64(3)
            ) ENGINE = MergeTree ORDER BY (type, occurred_at)
          `,
        });
        this.log.log("ClickHouse schema ready");
        return;
      } catch (e) {
        if (i === retries - 1) this.log.warn(`clickhouse schema not ready: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async ready(): Promise<boolean> {
    if (!this.ch) return false;
    try {
      await this.ch.query({ query: "SELECT 1", format: "JSONEachRow" });
      return true;
    } catch {
      return false;
    }
  }

  /** Sink a domain event (from Kafka) into ClickHouse. */
  async ingestEvent(event: DomainEvent): Promise<void> {
    await this.insert({
      event_id: event.eventId,
      type: event.type,
      actor: event.actor ?? "",
      source: "event",
      occurred_at: event.occurredAt,
      payload: JSON.stringify(event.payload ?? {}),
    });
  }

  /** Record a tracked event (from clients/services via HTTP). */
  async track(input: TrackInput): Promise<void> {
    await this.insert({
      event_id: cryptoRandom(),
      type: input.type,
      actor: input.actor ?? "",
      source: input.source ?? "client",
      occurred_at: new Date().toISOString(),
      payload: JSON.stringify(input.payload ?? {}),
    });
  }

  async overview(): Promise<{ type: string; count: number }[]> {
    if (!this.ch) return [];
    const rs = await this.ch.query({
      query: "SELECT type, count() AS count FROM events GROUP BY type ORDER BY count DESC",
      format: "JSONEachRow",
    });
    const rows = await rs.json<{ type: string; count: string }>();
    return rows.map((r) => ({ type: r.type, count: Number(r.count) }));
  }

  async funnel(): Promise<{ stage: string; count: number }[]> {
    const counts = new Map((await this.overview()).map((r) => [r.type, r.count]));
    return FUNNEL_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
  }

  private async insert(row: Record<string, string>): Promise<void> {
    if (!this.ch) return;
    try {
      await this.ch.insert({ table: "events", values: [row], format: "JSONEachRow" });
    } catch (e) {
      this.log.warn(`clickhouse insert failed: ${(e as Error).message}`);
    }
  }
}

function cryptoRandom(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
