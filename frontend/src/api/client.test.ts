import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./client";

describe("api client", () => {
  it("returns JSON responses from /api endpoints", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ip: "10.0.0.5", role: "learner", roleLabel: "学习者", permissions: [] }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );

    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.me()).resolves.toMatchObject({ role: "learner", roleLabel: "学习者" });
    expect(fetchMock).toHaveBeenCalledWith("/api/me", expect.objectContaining({ headers: expect.any(Headers) }));
  });

  it("normalizes backend JSON error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "ROLE_FORBIDDEN", message: "Role is not allowed" }), {
        headers: { "content-type": "application/json" },
        status: 403
      })
    );

    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.get("/admin/settings")).rejects.toMatchObject({
      code: "ROLE_FORBIDDEN",
      message: "Role is not allowed",
      status: 403
    });
  });

  it("falls back to HTTP status when error body is not backend-shaped JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.get("/broken")).rejects.toEqual(new ApiError("HTTP_500", "Request failed with status 500", 500));
  });
});
