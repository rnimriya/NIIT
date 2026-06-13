import { Logger } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import { outbox, type Database } from "@neet/db";
import { EventBus, type DomainEvent } from "@neet/events";

/**
 * Polls the outbox and publishes unpublished events to Kafka, marking them
 * published in the same transaction. FOR UPDATE SKIP LOCKED makes it safe to
 * run multiple relay instances. This is the delivery half of the transactional
 * outbox pattern — the write half happens inside the scoring transaction.
 */
export class OutboxRelay {
  private readonly log = new Logger("OutboxRelay");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly bus: EventBus,
    private readonly intervalMs = 1000,
    private readonly batch = 100,
  ) {}

  async start(): Promise<void> {
    await this.bus.connect();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.log.log("outbox relay started");
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return; // no overlapping runs
    this.running = true;
    try {
      await this.db.transaction(async (tx) => {
        const rows = await tx
          .select()
          .from(outbox)
          .where(eq(outbox.published, false))
          .orderBy(asc(outbox.createdAt))
          .limit(this.batch)
          .for("update", { skipLocked: true });

        for (const row of rows) {
          await this.bus.publish(row.topic, row.key, row.payload as DomainEvent);
          await tx
            .update(outbox)
            .set({ published: true, publishedAt: new Date() })
            .where(eq(outbox.id, row.id));
        }
        if (rows.length) this.log.log(`relayed ${rows.length} event(s)`);
      });
    } catch (e) {
      this.log.warn(`relay tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
