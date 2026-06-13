import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { notifications, type Database } from "@neet/db";
import { DB } from "./db.module";
import { config, emailEnabled } from "./config";

export interface EmitInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  channel?: "in_app" | "email" | "push";
  dedupeWindowSec?: number;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Creates a notification, deduping repeats of the same (user,type) in a window. */
  async emit(input: EmitInput): Promise<{ created: boolean; deduped?: boolean }> {
    const channel = input.channel ?? "in_app";
    const windowSec = input.dedupeWindowSec ?? 300;
    const dedupeKey = `${input.userId}:${input.type}`;

    const since = new Date(Date.now() - windowSec * 1000);
    const [dup] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.dedupeKey, dedupeKey),
          gt(notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (dup) return { created: false, deduped: true };

    await this.db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      channel,
      title: input.title,
      body: input.body,
      dedupeKey,
      status: "sent",
    });

    if (channel === "email") await this.sendEmail(input);
    return { created: true };
  }

  async list(userId: string, limit = 30) {
    return this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async unreadCount(userId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return count;
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.db
      .update(notifications)
      .set({ status: "read", readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  /** Sends via Resend when configured; otherwise logs (dev). */
  private async sendEmail(input: EmitInput): Promise<void> {
    if (!emailEnabled) {
      this.log.log(`[email:dev] → ${input.userId}: ${input.title}`);
      return;
    }
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.EMAIL_FROM,
          to: input.userId, // in production: resolve user email from profile
          subject: input.title,
          text: input.body,
        }),
      });
    } catch (e) {
      this.log.warn(`email send failed: ${(e as Error).message}`);
    }
  }
}
