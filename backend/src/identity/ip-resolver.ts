import { ForbiddenException } from "@nestjs/common";

export interface RequestIpSource {
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  headers?: Record<string, string | string[] | undefined>;
}

export interface ResolveRequestIpOptions {
  trustedProxyCidrs: string[];
}

export function normalizeIpv4(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const candidate = trimmed.toLowerCase().startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
  const parts = candidate.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    return octet >= 0 && octet <= 255 ? octet : null;
  });

  if (octets.some((octet) => octet === null)) {
    return null;
  }

  return octets.join(".");
}

export function resolveRequestIp(request: RequestIpSource, options: ResolveRequestIpOptions): string | null {
  const directIp = normalizeIpv4(request.socket?.remoteAddress ?? request.ip);
  if (directIp === null) {
    return null;
  }

  if (!isIpInCidrs(directIp, options.trustedProxyCidrs)) {
    return directIp;
  }

  for (const forwardedValue of xForwardedForValues(request.headers?.["x-forwarded-for"])) {
    const forwardedIp = normalizeIpv4(forwardedValue);
    if (forwardedIp !== null) {
      return forwardedIp;
    }
  }

  return directIp;
}

export function assertIpAllowed(ip: string | null, allowedCidrs: string[]): asserts ip is string {
  if (ip === null || !isIpInCidrs(ip, allowedCidrs)) {
    throw new ForbiddenException({
      code: "IP_NOT_ALLOWED",
      message: "IP is not allowed"
    });
  }
}

export function isIpInCidrs(ip: string, cidrs: string[]): boolean {
  const ipNumber = ipv4ToNumber(ip);
  if (ipNumber === null) {
    return false;
  }

  return cidrs.some((cidr) => {
    const parsed = parseCidr(cidr);
    if (parsed === null) {
      return false;
    }

    const mask = parsed.prefix === 0 ? 0 : (0xffffffff << (32 - parsed.prefix)) >>> 0;
    return (ipNumber & mask) >>> 0 === (parsed.network & mask) >>> 0;
  });
}

export function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function xForwardedForValues(header: string | string[] | undefined): string[] {
  const values = Array.isArray(header) ? header : header === undefined ? [] : [header];
  return values.flatMap((value) => value.split(",").map((entry) => entry.trim()));
}

function parseCidr(value: string): { network: number; prefix: number } | null {
  const segments = value.trim().split("/");
  if (segments.length !== 2) {
    return null;
  }
  const [ip, prefixText] = segments;
  const normalizedIp = normalizeIpv4(ip);
  if (normalizedIp === null || prefixText === undefined || !/^(0|[1-9]\d?)$/.test(prefixText)) {
    return null;
  }

  const prefix = Number(prefixText);
  const network = ipv4ToNumber(normalizedIp);
  if (network === null || prefix < 0 || prefix > 32) {
    return null;
  }

  return { network, prefix };
}

function ipv4ToNumber(ip: string): number | null {
  const normalized = normalizeIpv4(ip);
  if (normalized === null) {
    return null;
  }

  return normalized.split(".").reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}
