import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import { randomUUID } from "node:crypto";

/** Topic for assessment/learning events (StudyCompleted, TestScored, ...). */
export const ASSESSMENT_TOPIC = "assessment.events";

export interface DomainEvent<T = Record<string, unknown>> {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  actor?: string; // userId
  payload: T;
}

/** Returns the configured brokers, or null when Kafka is disabled. */
export function kafkaBrokers(): string[] | null {
  const v = process.env.KAFKA_BROKERS;
  if (!v) return null;
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : null;
}

/**
 * Thin Kafka wrapper. The platform runs in two modes:
 *   - Kafka enabled  → producers publish, consumers react (event-driven)
 *   - Kafka disabled → callers fall back to direct HTTP (still fully functional)
 * This keeps the simple path simple and lets the event bus scale fan-out.
 */
export class EventBus {
  private kafka: Kafka;
  private producer?: Producer;
  private consumers: Consumer[] = [];

  constructor(brokers: string[], clientId: string) {
    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.NOTHING,
      retry: { retries: 8, initialRetryTime: 300 },
    });
  }

  makeEvent<T extends Record<string, unknown>>(
    type: string,
    payload: T,
    actor?: string,
  ): DomainEvent<T> {
    return {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      actor,
      payload,
    };
  }

  async connect(): Promise<void> {
    if (this.producer) return;
    this.producer = this.kafka.producer();
    await this.producer.connect();
  }

  async publish(topic: string, key: string, event: DomainEvent): Promise<void> {
    await this.connect();
    await this.producer!.send({
      topic,
      messages: [{ key, value: JSON.stringify(event) }],
    });
  }

  async consume(
    groupId: string,
    topics: string[],
    handler: (event: DomainEvent) => Promise<void>,
  ): Promise<void> {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    for (const t of topics) await consumer.subscribe({ topic: t, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          await handler(JSON.parse(message.value.toString()) as DomainEvent);
        } catch {
          /* at-least-once: a throw here re-delivers; swallow to avoid poison loops in the slice */
        }
      },
    });
    this.consumers.push(consumer);
  }

  /** Blocks until the broker is reachable (admin metadata fetch). */
  async waitReady(timeoutMs = 30000): Promise<void> {
    const admin = this.kafka.admin();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await admin.connect();
        await admin.listTopics();
        await admin.disconnect();
        return;
      } catch (e) {
        if (Date.now() > deadline) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async ensureTopics(topics: string[]): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    await admin
      .createTopics({ topics: topics.map((topic) => ({ topic, numPartitions: 3 })) })
      .catch(() => undefined);
    await admin.disconnect();
  }

  async disconnect(): Promise<void> {
    await this.producer?.disconnect().catch(() => undefined);
    for (const c of this.consumers) await c.disconnect().catch(() => undefined);
  }
}
