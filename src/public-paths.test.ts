import { describe, expect, test } from "bun:test";
import { isPublicApiPath } from "./public-paths";

describe("paths open without a session", () => {
  test("only sign-in and the first login are open", () => {
    for (const path of ["/api/login", "/api/setup"]) expect(isPublicApiPath(path)).toBe(true);
  });

  test("routes that merely end like an open one stay closed", () => {
    for (const path of ["/api/settings/login", "/api/settings/carrier/setup", "/api/system/setup", "/api/health", "/api/up", "/api/login/x"]) {
      expect(isPublicApiPath(path)).toBe(false);
    }
  });
});
