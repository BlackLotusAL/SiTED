import { ForbiddenException } from "@nestjs/common";
import { assertIpAllowed, normalizeIpv4, resolveRequestIp } from "./ip-resolver";

describe("ip resolver", () => {
  it("uses the direct socket IP when the socket is not a trusted proxy", () => {
    const ip = resolveRequestIp(
      request({ remoteAddress: "10.1.2.3", xForwardedFor: "192.168.1.10, 192.168.1.11" }),
      { trustedProxyCidrs: ["172.16.0.0/12"] }
    );

    expect(ip).toBe("10.1.2.3");
  });

  it("uses the first valid IPv4 from X-Forwarded-For when socket is a trusted proxy", () => {
    const ip = resolveRequestIp(
      request({ remoteAddress: "172.16.10.20", xForwardedFor: "bad, ::ffff:192.168.1.10, 192.168.1.11" }),
      { trustedProxyCidrs: ["172.16.0.0/12"] }
    );

    expect(ip).toBe("192.168.1.10");
  });

  it("falls back to the normalized trusted proxy socket IP when X-Forwarded-For has no valid IPv4", () => {
    const ip = resolveRequestIp(
      request({ remoteAddress: "::ffff:172.16.10.20", xForwardedFor: "unknown, 2001:db8::1" }),
      { trustedProxyCidrs: ["172.16.0.0/12"] }
    );

    expect(ip).toBe("172.16.10.20");
  });

  it("normalizes IPv4-mapped IPv6 addresses and rejects non-IPv4 values", () => {
    expect(normalizeIpv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeIpv4("127.000.000.001")).toBeNull();
    expect(normalizeIpv4("2001:db8::1")).toBeNull();
    expect(normalizeIpv4("999.1.1.1")).toBeNull();
  });

  it("allows IPs in configured CIDRs and rejects IPs outside them with IP_NOT_ALLOWED", () => {
    expect(assertIpAllowed("10.2.3.4", ["10.0.0.0/8", "127.0.0.1/32"])).toBeUndefined();

    expect(() => assertIpAllowed("192.168.1.10", ["10.0.0.0/8", "127.0.0.1/32"])).toThrow(
      ForbiddenException
    );
    try {
      assertIpAllowed("192.168.1.10", ["10.0.0.0/8", "127.0.0.1/32"]);
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({
        code: "IP_NOT_ALLOWED",
        message: "IP is not allowed"
      });
    }
  });

  it("rejects malformed CIDRs with extra slash segments", () => {
    expect(() => assertIpAllowed("10.2.3.4", ["10.0.0.0/8/comment"])).toThrow(ForbiddenException);
  });
});

function request(input: { remoteAddress?: string; xForwardedFor?: string | string[] }) {
  return {
    ip: input.remoteAddress,
    socket: { remoteAddress: input.remoteAddress },
    headers: input.xForwardedFor === undefined ? {} : { "x-forwarded-for": input.xForwardedFor }
  };
}
