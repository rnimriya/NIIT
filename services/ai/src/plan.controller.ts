import { Body, Controller, Post } from "@nestjs/common";
import { PlanInput } from "@neet/types";
import { AiService } from "./ai.service";

/**
 * Internal planner endpoint (called by the study service). In production this
 * sits behind the service mesh; here it's open for the local slice.
 */
@Controller("api/v1/ai")
export class PlanController {
  constructor(private readonly ai: AiService) {}

  @Post("plan")
  async plan(@Body() body: unknown) {
    const input = PlanInput.parse(body);
    return this.ai.generatePlan(input);
  }
}
