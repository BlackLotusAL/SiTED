import { afterEach } from "vitest";
import { clearStaleResourceCache } from "../hooks/useStaleResource";

afterEach(() => {
  clearStaleResourceCache();
});
