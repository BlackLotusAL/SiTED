import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearStaleResourceCache, useStaleResource } from "./useStaleResource";

describe("useStaleResource", () => {
  afterEach(() => {
    cleanup();
    clearStaleResourceCache();
    vi.restoreAllMocks();
  });

  it("returns cached data immediately and keeps it visible when background refresh fails", async () => {
    const loader = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("cached value")
      .mockRejectedValueOnce(new Error("offline"));

    const first = render(<ResourceProbe cacheKey="/api/demo" load={loader} />);

    expect(await screen.findByText("cached value")).toBeInTheDocument();
    first.unmount();

    render(<ResourceProbe cacheKey="/api/demo" load={loader} />);

    expect(screen.getByText("cached value")).toBeInTheDocument();
    expect(screen.queryByText("loading")).not.toBeInTheDocument();
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(screen.getByText("cached value")).toBeInTheDocument();
    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("loads when a disabled resource becomes enabled", async () => {
    const loader = vi.fn<() => Promise<string>>().mockResolvedValue("enabled value");
    const { rerender } = render(<ResourceProbe cacheKey="/api/deferred" enabled={false} load={loader} />);

    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();

    rerender(<ResourceProbe cacheKey="/api/deferred" enabled load={loader} />);

    expect(await screen.findByText("enabled value")).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

function ResourceProbe({ cacheKey, enabled = true, load }: { cacheKey: string; enabled?: boolean; load: () => Promise<string> }) {
  const resource = useStaleResource({ key: cacheKey, enabled, load });

  return (
    <div>
      <span>{resource.isInitialLoading ? "loading" : "ready"}</span>
      <strong>{resource.data ?? "empty"}</strong>
      {resource.error ? <em>error</em> : null}
    </div>
  );
}
