import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function openWithOldSettings(rows: Record<string, string>): string {
  const path = join(mkdtempSync(join(tmpdir(), "hn-migrate-")), "cabinet.sqlite");
  const old = new Database(path);
  old.run("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const [key, value] of Object.entries(rows)) old.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  old.close();
  const opened = Bun.spawnSync([process.execPath, "-e", `await import(${JSON.stringify(join(import.meta.dir, "db.ts"))})`], {
    env: { ...process.env, DB_PATH: path },
  });
  expect(opened.exitCode).toBe(0);
  return path;
}

function settings(path: string): Record<string, string> {
  const db = new Database(path, { readonly: true });
  const rows = db.query("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  db.close();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

describe("settings migration", () => {
  test("a connection stored by an older cabinet moves to platform_connection", () => {
    const path = openWithOldSettings({ wr_connection: '{"slug":"acme"}' });
    expect(settings(path)).toEqual({ platform_connection: '{"slug":"acme"}' });
  });

  test("an existing platform_connection is kept and the old row is dropped", () => {
    const path = openWithOldSettings({ wr_connection: '{"slug":"old"}', platform_connection: '{"slug":"new"}' });
    expect(settings(path)).toEqual({ platform_connection: '{"slug":"new"}' });
  });
});
