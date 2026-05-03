import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { IdentityService, type RequestIdentity } from "./identity.service";
import { assertIpAllowed, parseCsv, resolveRequestIp } from "./ip-resolver";

export interface IdentityRequest extends Request {
  identity?: RequestIdentity;
}

@Injectable()
export class IdentityMiddleware implements NestMiddleware {
  constructor(private readonly identityService: IdentityService) {}

  async use(req: IdentityRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = resolveRequestIp(req, { trustedProxyCidrs: parseCsv(process.env.TRUSTED_PROXY_CIDRS) });
      assertIpAllowed(ip, parseCsv(process.env.ALLOWED_CIDR));
      req.identity = await this.identityService.resolveIdentity(ip);
      next();
    } catch (error) {
      next(error);
    }
  }
}
