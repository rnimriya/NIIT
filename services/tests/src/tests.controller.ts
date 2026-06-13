import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { claimsFromHeader } from "@neet/shared";
import { TestsService } from "./tests.service";
import { config } from "./config";

const SubmitDto = z.object({
  responses: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selected: z.string().nullable().optional(),
      }),
    )
    .max(200),
});

@Controller("api/v1/test")
export class TestsController {
  constructor(private readonly tests: TestsService) {}

  /** Start a balanced diagnostic. Auth optional (attributes the test to a user). */
  @Post("diagnostic")
  async diagnostic(@Headers("authorization") authHeader?: string) {
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    return this.tests.buildDiagnostic(claims?.sub);
  }

  /** Submit answers → scored result. Signed-in users get persisted mastery. */
  @Post(":id/submit")
  async submit(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") authHeader?: string,
  ) {
    const dto = SubmitDto.parse(body);
    const claims = claimsFromHeader(authHeader, config.JWT_DEV_SECRET);
    return this.tests.score(id, dto.responses, claims?.sub);
  }
}
