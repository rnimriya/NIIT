import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import { claimsFromHeader } from "@neet/shared";
import { AuthService } from "./auth.service";
import { config } from "./config";

const RegisterDto = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(120).optional(),
});
const LoginDto = z.object({ email: z.string().email() });

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown) {
    const dto = RegisterDto.parse(body);
    const { user, token } = await this.auth.register(dto.email, dto.fullName);
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }

  @Post("login")
  async login(@Body() body: unknown) {
    const dto = LoginDto.parse(body);
    const result = await this.auth.login(dto.email);
    if (!result) throw new UnauthorizedException("No such user — register first");
    return {
      token: result.token,
      user: { id: result.user.id, email: result.user.email, role: result.user.role },
    };
  }

  @Get("me")
  async me(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    if (!claims) throw new UnauthorizedException();
    const user = await this.auth.findById(claims.sub);
    if (!user) throw new UnauthorizedException();
    return { id: user.id, email: user.email, role: user.role };
  }
}
