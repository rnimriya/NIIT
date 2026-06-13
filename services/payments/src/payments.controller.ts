import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { PlanTier } from "@neet/types";
import { claimsFromHeader } from "@neet/shared";
import { PaymentsService } from "./payments.service";
import { config } from "./config";
import { PLAN_CATALOG } from "./plans";

const CheckoutDto = z.object({ plan: PlanTier });

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("api/v1/payments/plans")
  plans() {
    return PLAN_CATALOG;
  }

  @Get("api/v1/entitlements")
  async entitlements(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    return this.payments.getEntitlements(claims.sub);
  }

  @Post("api/v1/payments/checkout")
  async checkout(@Body() body: unknown, @Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    const { plan } = CheckoutDto.parse(body);
    return this.payments.checkout(claims.sub, plan);
  }

  /** Stripe webhook — needs the raw body for signature verification. */
  @Post("webhooks/stripe")
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature?: string,
  ) {
    return this.payments.handleWebhook(req.rawBody ?? Buffer.from(""), signature ?? "");
  }
}
