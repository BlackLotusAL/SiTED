import { Controller, Get, InternalServerErrorException, Req } from "@nestjs/common";
import type { IdentityRequest } from "./identity.middleware";
import type { RequestIdentity } from "./identity.service";

@Controller("me")
export class IdentityController {
  @Get()
  me(@Req() request: IdentityRequest): RequestIdentity {
    if (request.identity === undefined) {
      throw new InternalServerErrorException({
        code: "IDENTITY_MISSING",
        message: "Request identity is missing"
      });
    }

    return request.identity;
  }
}
