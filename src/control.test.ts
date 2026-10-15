import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { controlStatus, requestAction } from "./control";

function controlDir(enabled = true): string {
  const dir = mkdtempSync(join(tmpdir(), "hn-control-"));
  mkdirSync(join(dir, "inbox"));
  if (enabled) writeFileSync(join(dir, "enabled"), "1\n");
  return dir;
}

describe("server actions", () => {
  test("without the server service nothing can be requested", () => {
    expect(controlStatus(null)).toEqual({ available: false });
    const dir = controlDir(false);
    expect(controlStatus(dir)).toEqual({ available: false });
    expect(() => requestAction("update", dir)).toThrow(/not installed/);
  });

  test("an update request is left for the server service", () => {
    const dir = controlDir();
    requestAction("update", dir);
    expect(readFileSync(join(dir, "inbox", "request"), "utf8").trim()).toBe("update");
    expect(controlStatus(dir)).toMatchObject({ available: true, requested: "update" });
  });

  test("a second request waits until the first one is taken", () => {
    const dir = controlDir();
    requestAction("apply-sip", dir);
    expect(() => requestAction("update", dir)).toThrow(/already/);
  });

  test("nothing new starts while an action runs", () => {
    const dir = controlDir();
    writeFileSync(join(dir, "status.json"), JSON.stringify({ action: "update", state: "running", startedAt: "2026-10-15T15:00:00Z" }));
    expect(() => requestAction("apply-sip", dir)).toThrow(/running/);
    expect(existsSync(join(dir, "inbox", "request"))).toBe(false);
  });

  test("an unknown action is refused", () => {
    const dir = controlDir();
    expect(() => requestAction("rm -rf /" as never, dir)).toThrow(/unknown/);
    expect(existsSync(join(dir, "inbox", "request"))).toBe(false);
  });

  test("the status carries the last run and the end of its log", () => {
    const dir = controlDir();
    writeFileSync(join(dir, "status.json"), JSON.stringify({ action: "update", state: "failed", startedAt: "2026-10-15T15:00:00Z", finishedAt: "2026-10-15T15:02:00Z" }));
    writeFileSync(join(dir, "update.log"), Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
    const status = controlStatus(dir);
    expect(status).toMatchObject({ available: true, requested: null, last: { action: "update", state: "failed", finishedAt: "2026-10-15T15:02:00Z" } });
    const log = (status as { log: string[] }).log;
    expect(log).toHaveLength(40);
    expect(log[39]).toBe("line 80");
  });

  test("a broken status file reads as no run", () => {
    const dir = controlDir();
    writeFileSync(join(dir, "status.json"), "{not json");
    expect(controlStatus(dir)).toMatchObject({ available: true, last: null, log: [] });
  });
});

describe("a run cut short by a reboot", () => {
  test("a run that never finished stops blocking the buttons after half an hour", () => {
    const dir = controlDir();
    const startedAt = new Date(Date.now() - 31 * 60_000).toISOString();
    writeFileSync(join(dir, "status.json"), JSON.stringify({ action: "update", state: "running", startedAt }));
    expect(controlStatus(dir)).toMatchObject({ last: { action: "update", state: "failed" } });
    requestAction("update", dir);
    expect(readFileSync(join(dir, "inbox", "request"), "utf8").trim()).toBe("update");
  });
});

describe("the log shown in the cabinet", () => {
  test("terminal colour codes of the installer output are dropped", () => {
    const dir = controlDir();
    writeFileSync(join(dir, "status.json"), JSON.stringify({ action: "update", state: "ok", startedAt: "2026-10-15T15:00:00Z", finishedAt: "2026-10-15T15:01:00Z" }));
    writeFileSync(join(dir, "update.log"), "\u001b[1m==> Done\u001b[0m\n  \u001b[32mok\u001b[0m    cabinet is healthy\n");
    expect((controlStatus(dir) as { log: string[] }).log).toEqual(["==> Done", "  ok    cabinet is healthy"]);
  });
});
