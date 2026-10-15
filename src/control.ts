import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

export const SERVER_ACTIONS = ["update", "apply-sip"] as const;

export type ServerAction = (typeof SERVER_ACTIONS)[number];

type LastRun = { action: ServerAction; state: "running" | "ok" | "failed"; startedAt?: string; finishedAt?: string };

export type ControlStatus = { available: false } | { available: true; requested: ServerAction | null; last: LastRun | null; log: string[] };

const LOG_LINES = 40;

const STALE_RUN_MS = 30 * 60_000;

function isAction(value: unknown): value is ServerAction {
  return typeof value === "string" && (SERVER_ACTIONS as readonly string[]).includes(value);
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function readLast(dir: string): LastRun | null {
  try {
    const value = JSON.parse(readText(join(dir, "status.json")) ?? "null") as Partial<LastRun> | null;
    if (!value || !isAction(value.action) || !["running", "ok", "failed"].includes(value.state ?? "")) return null;
    const started = Date.parse(value.startedAt ?? "");
    if (value.state === "running" && !(started > Date.now() - STALE_RUN_MS)) return { ...value, state: "failed" } as LastRun;
    return value as LastRun;
  } catch {
    return null;
  }
}

export function controlStatus(dir: string | null = config.controlDir): ControlStatus {
  if (!dir || !existsSync(join(dir, "enabled"))) return { available: false };
  const requested = readText(join(dir, "inbox", "request"))?.trim();
  const last = readLast(dir);
  const log = last ? (readText(join(dir, `${last.action}.log`)) ?? "").split("\n").filter(Boolean).slice(-LOG_LINES) : [];
  return { available: true, requested: isAction(requested) ? requested : null, last, log };
}

export function requestAction(action: ServerAction, dir: string | null = config.controlDir): void {
  if (!isAction(action)) throw new Error(`unknown action ${String(action)}`);
  const status = controlStatus(dir);
  if (!status.available || !dir) throw new Error("the server service is not installed; run update.sh once on the server");
  if (status.requested) throw new Error(`${status.requested} is already requested`);
  if (status.last?.state === "running") throw new Error(`${status.last.action} is running`);
  const pending = join(dir, "inbox", ".request");
  writeFileSync(pending, `${action}\n`);
  renameSync(pending, join(dir, "inbox", "request"));
}
