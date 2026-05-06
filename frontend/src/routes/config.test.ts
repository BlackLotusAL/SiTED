import { describe, expect, it } from "vitest";
import { routeTitleForPath } from "./config";

describe("routeTitleForPath", () => {
  it("does not keep the temporary typography preview title", () => {
    expect(routeTitleForPath("/typography-preview")).not.toBe("字体预览");
  });
});
