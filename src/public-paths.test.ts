import { describe, expect, test } from "bun:test";
import { isPublicApiPath } from "./public-paths";

describe("paths open without a session", () => {
  test("only sign-in, first login and health checks are open", () => {
    for (const path of ["/api/login", "/api/setup", "/api/health", "/api/up"]) expect(isPublicApiPath(path)).toBe(true);
  });

  test("routes that merely end like an open one stay closed", () => {
    for (const path of ["/api/settings/login", "/api/settings/carrier/setup", "/api/system/setup", "/api/numbers/health", "/api/login/x"]) {
      expect(isPublicApiPath(path)).toBe(false);
    }
  });
});
