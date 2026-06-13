import { Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { claimsFromHeader } from "@neet/shared";
import { PredictionService } from "./prediction.service";
import { config } from "./config";

@Controller("api/v1/prediction")
export class PredictionController {
  constructor(private readonly prediction: PredictionService) {}

  /** Latest stored prediction; computes one on first call if none exists. */
  @Get()
  async get(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    return (await this.prediction.latest(claims.sub)) ?? this.prediction.compute(claims.sub);
  }

  /** Force a fresh recompute (e.g. right after a test submission). */
  @Post("recompute")
  async recompute(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    return this.prediction.compute(claims.sub);
  }
}
