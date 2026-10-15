import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const name of [
  "FF3_KEY",
  "FF3_TWEAK",
  "ROUTE_DIGIT",
  "DECRYPT_KEY",
  "CABINET_USER",
  "CABINET_PASSWORD",
  "CLIENT_PREFIX",
  "DB_PATH",
  "PLATFORM_BASE_URL",
  "PLATFORM_SLUG",
  "PLATFORM_API_KEY",
  "PLATFORM_EVENT_TYPE",
  "PLATFORM_PLAYER_SEGMENT",
  "PLATFORM_COHORT",
]) {
  delete process.env[name];
}

process.env.FF3_KEY = "EF4359D8D580AA4F7F036D6F04FC6A94";
process.env.FF3_TWEAK = "D8E7920AFA330A73";
process.env.DECRYPT_KEY = "test-decrypt-key-0123456789";
process.env.PLATFORM_BASE_URL = "http://core.test";
process.env.PLATFORM_SLUG = "test-client";
process.env.PLATFORM_API_KEY = "ak_test_0123456789abcdef";
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "hn-test-")), "cabinet.sqlite");

const { initKeys } = await import("./keys");
initKeys(process.env);
