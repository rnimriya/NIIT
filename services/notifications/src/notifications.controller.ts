import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { claimsFromHeader } from "@neet/shared";
import { NotificationsService } from "./notifications.service";
import { config } from "./config";

const EmitDto = z.object({
  userId: z.string().uuid(),
  type: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  channel: z.enum(["in_app", "email", "push"]).optional(),
  dedupeWindowSec: z.number().int().optional(),
});

@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Internal emit (called by other services). Mesh-internal in production. */
  @Post("emit")
  async emit(@Body() body: unknown) {
    const dto = EmitDto.parse(body);
    return this.notifications.emit(dto);
  }

  @Get()
  async list(@Headers("authorization") authHeader?: string) {
    const claims = this.requireUser(authHeader);
    const [items, unread] = await Promise.all([
      this.notifications.list(claims.sub),
      this.notifications.unreadCount(claims.sub),
    ]);
    return { unread, items };
  }

  @Post(":id/read")
  async read(@Param("id") id: string, @Headers("authorization") authHeader?: string) {
    const claims = this.requireUser(authHeader);
    await this.notifications.markRead(claims.sub, id);
    return { ok: true };
  }

  @Post("read-all")
  async readAll(@Headers("authorization") authHeader?: string) {
    const claims = this.requireUser(authHeader);
    await this.notifications.markAllRead(claims.sub);
    return { ok: true };
  }

  private requireUser(authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    return claims;
  }
}
