import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { claimsFromHeader } from "@neet/shared";
import { TestsService } from "./tests.service";
import { config } from "./config";

@Controller("api/v1/mastery")
export class MasteryController {
  constructor(private readonly tests: TestsService) {}

  @Get()
  async mine(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    return this.tests.getMastery(claims.sub);
  }
}
