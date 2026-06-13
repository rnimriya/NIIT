import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { claimsFromHeader } from "@neet/shared";
import { StudyService } from "./study.service";
import { config } from "./config";

const GenerateDto = z.object({
  horizonDays: z.number().int().min(1).max(90).optional(),
});

@Controller("api/v1/study")
export class StudyController {
  constructor(private readonly study: StudyService) {}

  /** Generate (and persist) a fresh AI study plan from the latest prediction. */
  @Post("plan")
  async generate(@Body() body: unknown, @Headers("authorization") authHeader?: string) {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    const dto = GenerateDto.parse(body ?? {});
    return this.study.generatePlan(claims.sub, token, dto.horizonDays ?? 7);
  }

  /** Latest stored plan. */
  @Get("plan")
  async latest(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    const plan = await this.study.getLatest(claims.sub);
    if (!plan) throw new NotFoundException("No plan yet — generate one");
    return plan;
  }
}
