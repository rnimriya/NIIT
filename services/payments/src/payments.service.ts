import { Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import {
  subscriptions,
  entitlements,
  payments,
  type Database,
} from "@neet/db";
import type { Entitlements, PlanTier } from "@neet/types";
import { emitNotification } from "@neet/shared";
import { DB } from "./db.module";
import { config, stripeEnabled } from "./config";
import { PLAN_FEATURES } from "./plans";

@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);
  private readonly stripe = stripeEnabled
    ? new Stripe(config.STRIPE_SECRET_KEY as string)
    : null;

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Current entitlements, defaulting to the free tier. */
  async getEntitlements(userId: string): Promise<Entitlements> {
    const [row] = await this.db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, userId))
      .limit(1);
    return (row?.features as Entitlements) ?? PLAN_FEATURES.free;
  }

  /**
   * Start an upgrade. With Stripe configured, returns a hosted Checkout URL.
   * Without it (local/dev), activates the plan immediately so the flow is
   * fully runnable end to end.
   */
  async checkout(
    userId: string,
    plan: PlanTier,
  ): Promise<{ url: string } | { devActivated: true; entitlements: Entitlements }> {
    if (plan === "free") {
      await this.activate(userId, "free");
      return { devActivated: true, entitlements: PLAN_FEATURES.free };
    }

    if (this.stripe) {
      const price = plan === "plus" ? config.STRIPE_PRICE_PLUS : config.STRIPE_PRICE_PRO;
      const session = await this.stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        success_url: config.CHECKOUT_SUCCESS_URL,
        cancel_url: config.CHECKOUT_CANCEL_URL,
        client_reference_id: userId,
        metadata: { userId, plan },
      });
      return { url: session.url as string };
    }

    // Dev path — no Stripe keys: grant immediately.
    const ent = await this.activate(userId, plan);
    return { devActivated: true, entitlements: ent };
  }

  /** Idempotently applies a plan: subscription + entitlements (+ payment row). */
  async activate(
    userId: string,
    plan: PlanTier,
    opts: { stripeEventId?: string; amountCents?: number } = {},
  ): Promise<Entitlements> {
    const features = PLAN_FEATURES[plan];
    await this.db.transaction(async (tx) => {
      await tx
        .insert(subscriptions)
        .values({ userId, plan, status: "active" })
        .onConflictDoNothing();
      await tx
        .insert(entitlements)
        .values({ userId, features })
        .onConflictDoUpdate({
          target: entitlements.userId,
          set: { features, updatedAt: new Date() },
        });
      if (opts.stripeEventId) {
        await tx
          .insert(payments)
          .values({
            userId,
            stripeEventId: opts.stripeEventId,
            amountCents: opts.amountCents ?? 0,
          })
          .onConflictDoNothing(); // dedupe replays
      }
    });

    if (plan !== "free") {
      void emitNotification(config.NOTIFICATIONS_URL, {
        userId,
        type: "subscription_active",
        title: `Welcome to ${plan.toUpperCase()}`,
        body: `Your ${plan} plan is active — Opus tutor and longer study plans are unlocked.`,
      });
    }
    return features;
  }

  /** Verifies + processes a Stripe webhook. Idempotent on the event id. */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: true }> {
    if (!this.stripe || !config.STRIPE_WEBHOOK_SECRET) {
      this.log.warn("webhook received but Stripe is not configured — ignoring");
      return { received: true };
    }
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.STRIPE_WEBHOOK_SECRET,
    );

    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.metadata?.userId ?? s.client_reference_id ?? undefined;
      const plan = (s.metadata?.plan as PlanTier) ?? "plus";
      if (userId) {
        await this.activate(userId, plan, {
          stripeEventId: event.id,
          amountCents: s.amount_total ?? 0,
        });
      }
    }
    return { received: true };
  }
}
