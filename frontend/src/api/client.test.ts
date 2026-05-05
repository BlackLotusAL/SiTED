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

  it("normalizes network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.get("/offline")).rejects.toEqual(new ApiError("NETWORK_ERROR", "Network request failed", 0));
  });

  it("returns undefined for successful empty or non-JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.get("/empty")).resolves.toBeUndefined();
  });

  it("sends FormData bodies without JSON stringifying or content-type injection", async () => {
    const form = new FormData();
    form.set("file", new Blob(["x"], { type: "text/plain" }), "question.txt");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const api = createApiClient({ fetcher: fetchMock });

    await api.post("/uploads", form);

    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(requestInit.body).toBe(form);
    expect((requestInit.headers as Headers).get("content-type")).toBeNull();
  });

  it("sends object bodies as JSON with content-type injection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const api = createApiClient({ fetcher: fetchMock });

    await api.post("/practice/submit", { questionId: "q1", submittedAnswers: ["A"] });

    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(requestInit.body).toBe(JSON.stringify({ questionId: "q1", submittedAnswers: ["A"] }));
    expect((requestInit.headers as Headers).get("content-type")).toBe("application/json");
  });

  it("sends raw string bodies without JSON stringifying or content-type injection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const api = createApiClient({ fetcher: fetchMock });

    await api.post("/raw", "abc");

    const [, requestInit] = fetchMock.mock.calls[0]!;
    expect(requestInit.body).toBe("abc");
    expect((requestInit.headers as Headers).get("content-type")).toBeNull();
  });

  it("supports DELETE requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), {
        headers: { "content-type": "application/json" },
        status: 200
      })
    );
    const api = createApiClient({ fetcher: fetchMock });

    await expect(api.delete("/admin/settings/ip-role-bindings/10.0.0.9")).resolves.toEqual({ deleted: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/settings/ip-role-bindings/10.0.0.9",
      expect.objectContaining({ method: "DELETE", headers: expect.any(Headers) })
    );
  });
});
