import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { phoneCountry } from "./phone-country";
import { countryStats, getByToken, insertRequest, recordRequestResult, updateNumber } from "./db";
import { encryptPhone } from "./fpe";
import { ingestRecords } from "./uploads";
import { hooks } from "./hooks";
import { buildEvent } from "./platform";
import { DEFAULT_PLATFORM_FIELDS, PLATFORM_SOURCE_FIELDS, setInboundKey } from "./webhook";
import { toCoreCsv } from "./csv";

describe("phone country detection", () => {
  test("splits the shared +1 and +7 calling codes by country", () => {
    expect(phoneCountry("+12125551234")).toBe("US");
    expect(phoneCountry("+14165551234")).toBe("CA");
    expect(phoneCountry("+18765551234")).toBe("JM");
    expect(phoneCountry("+17871234567")).toBe("PR");
    expect(phoneCountry("+79161234567")).toBe("RU");
    expect(phoneCountry("+77012345678")).toBe("KZ");
  });

  test("reads numbers without a plus and with formatting", () => {
    expect(phoneCountry("380501234567")).toBe("UA");
    expect(phoneCountry("+31 6 1234 0001")).toBe("NL");
    expect(phoneCountry("(+49) 151-2345-6789")).toBe("DE");
  });

  test("returns null when the country cannot be told", () => {
    expect(phoneCountry("")).toBeNull();
    expect(phoneCountry(null)).toBeNull();
    expect(phoneCountry("+80012345678")).toBeNull();
    expect(phoneCountry("+19999999999")).toBeNull();
    expect(phoneCountry("12")).toBeNull();
    expect(phoneCountry("+3801")).toBeNull();
    expect(phoneCountry("+3805012345678901")).toBeNull();
  });
});

describe("every new number gets its phone country", () => {
  test("an uploaded file keeps the client country and adds the detected one", () => {
    const real = "+3545812001";
    ingestRecords([{ phone: real, country: "xx" }], "country-upload.csv");
    const row = getByToken(encryptPhone(real))!;
    expect(row.phone_country).toBe("IS");
    expect(row.country).toBe("xx");
  });

  test("a number sent through /hook/players gets it too", async () => {
    const key = "phone-country-inbound-key-0123456789";
    setInboundKey(key);
    const real = "+35699123401";
    const res = await hooks.handle(
      new Request("http://cabinet/hook/players", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key },
        body: JSON.stringify([{ phone: real, segment: "s" }]),
      }),
    );
    expect(res.status).toBe(202);
    expect(getByToken(encryptPhone(real))!.phone_country).toBe("MT");
  });

  test("changing the real number recomputes it", () => {
    const real = "+3545812002";
    ingestRecords([{ phone: real }], "country-edit.csv");
    const row = getByToken(encryptPhone(real))!;
    const moved = "+35699123402";
    updateNumber(row.id, { real: moved, token: encryptPhone(moved) });
    expect(getByToken(encryptPhone(moved))!.phone_country).toBe("MT");
  });
});

describe("numbers stored before detection existed", () => {
  test("are backfilled on startup, undetectable ones stay null", () => {
    const path = join(mkdtempSync(join(tmpdir(), "hn-country-")), "cabinet.sqlite");
    const old = new Database(path);
    old.run(`CREATE TABLE numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, upload_id INTEGER, real TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE,
      external_id TEXT, first_name TEXT, last_name TEXT, country TEXT, language TEXT, segment TEXT, cohort TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), pushed_at TEXT)`);
    const insert = old.prepare("INSERT INTO numbers (real, token, country) VALUES (?, ?, ?)");
    for (let i = 0; i < 1203; i += 1) insert.run(`+1416555${String(i).padStart(4, "0")}`, `t-${i}`, null);
    insert.run("+80012345678", "t-nongeo", "DE");
    insert.run("77012345678", "t-kz", "ru");
    old.close();

    const open = () =>
      Bun.spawnSync([process.execPath, "-e", `await import(${JSON.stringify(join(import.meta.dir, "db.ts"))})`], {
        env: { ...process.env, DB_PATH: path },
      });
    expect(open().exitCode).toBe(0);
    expect(open().exitCode).toBe(0);

    const db = new Database(path, { readonly: true });
    const rows = db.query("SELECT token, country, phone_country FROM numbers").all() as { token: string; country: string | null; phone_country: string | null }[];
    db.close();
    const by = new Map(rows.map((r) => [r.token, r]));
    expect(rows.filter((r) => r.phone_country === "CA")).toHaveLength(1203);
    expect(by.get("t-nongeo")).toEqual({ token: "t-nongeo", country: "DE", phone_country: null });
    expect(by.get("t-kz")).toEqual({ token: "t-kz", country: "ru", phone_country: "KZ" });
  });

  test("run once, so a restart does not re-read numbers whose country stayed unknown", () => {
    const path = join(mkdtempSync(join(tmpdir(), "hn-country-")), "cabinet.sqlite");
    const open = () =>
      Bun.spawnSync([process.execPath, "-e", `await import(${JSON.stringify(join(import.meta.dir, "db.ts"))})`], {
        env: { ...process.env, DB_PATH: path },
      });
    expect(open().exitCode).toBe(0);
    const db = new Database(path);
    db.prepare("INSERT INTO numbers (real, token) VALUES (?, ?)").run("+14165550199", "t-later");
    db.close();
    expect(open().exitCode).toBe(0);
    const check = new Database(path, { readonly: true });
    const row = check.query("SELECT phone_country FROM numbers WHERE token = 't-later'").get() as { phone_country: string | null };
    check.close();
    expect(row.phone_country).toBeNull();
  });
});

describe("the platform gets the country, never the number", () => {
  const platform = { baseUrl: "https://core.example", slug: "s", apiKey: "k", playerSegment: "seg", eventType: "player.registered", fields: DEFAULT_PLATFORM_FIELDS };
  const real = "+14165550101";
  const token = encryptPhone(real);
  const number = (over: Record<string, unknown>) =>
    ({ id: 9, real, token, segment: null, cohort: null, user_id: null, country: null, phone_country: "CA", language: null, first_name: null, last_name: null, ...over }) as never;
  const request = { call_id: "c-country", number_id: 9, segment: null, cohort: null } as never;

  test("phone_country is a source and the shipped mapping sends it as country", () => {
    expect(PLATFORM_SOURCE_FIELDS).toContain("phone_country");
    expect(DEFAULT_PLATFORM_FIELDS).toContainEqual({ as: "country", from: "phone_country" });
    const event = buildEvent(number({}), request, platform);
    expect(event.player.country).toBe("CA");
    expect(JSON.stringify(event)).not.toContain(real.slice(1));
  });

  test("a mapping saved before detection existed still sends the detected country", () => {
    const saved = { ...platform, fields: [{ as: "phone_e164" as const, from: "token" as const }] };
    expect(buildEvent(number({}), request, saved).player.country).toBe("CA");
  });

  test("an explicit country mapping with a value wins, an empty one falls back to the detected country", () => {
    const explicit = { ...platform, fields: [{ as: "phone_e164" as const, from: "token" as const }, { as: "country" as const, from: "country" as const }] };
    expect(buildEvent(number({ country: "FR" }), request, explicit).player.country).toBe("FR");
    expect(buildEvent(number({ country: null }), request, explicit).player.country).toBe("CA");
  });

  test("no country is sent when none was detected", () => {
    expect(buildEvent(number({ phone_country: null }), request, platform).player.country).toBeUndefined();
  });

  test("the real-number guard still applies", () => {
    expect(() => buildEvent(number({ token: real }), request, platform)).toThrow(/refusing to send a real phone number/);
  });
});

describe("per-country statistics", () => {
  test("counts numbers, requested calls, results and attempts per detected country", () => {
    ingestRecords([{ phone: "+50370001001" }, { phone: "+50370001002" }, { phone: "+50588001001" }], "country-stats.csv");
    const sv1 = getByToken(encryptPhone("+50370001001"))!;
    const sv2 = getByToken(encryptPhone("+50370001002"))!;
    const ni = getByToken(encryptPhone("+50588001001"))!;
    expect([sv1.phone_country, ni.phone_country]).toEqual(["SV", "NI"]);

    const call = (numberId: number) => insertRequest({ call_id: crypto.randomUUID(), number_id: numberId }).call_id;
    recordRequestResult(call(sv1.id), { leadId: null, campaignId: null, outcome: "no_answer", result: "no_answer", attempts: 2 });
    recordRequestResult(call(sv1.id), { leadId: null, campaignId: null, outcome: "agreed", result: "send_sms", attempts: 1 });
    call(sv2.id);
    recordRequestResult(call(ni.id), { leadId: null, campaignId: null, outcome: "busy", result: "busy", attempts: 3 });

    const stats = countryStats();
    expect(stats.find((s) => s.country === "SV")).toEqual({
      country: "SV",
      numbers: 2,
      requests: 3,
      results: 2,
      call_attempts: 3,
      by_result: { no_answer: 1, send_sms: 1 },
    });
    expect(stats.find((s) => s.country === "NI")).toEqual({
      country: "NI",
      numbers: 1,
      requests: 1,
      results: 1,
      call_attempts: 3,
      by_result: { busy: 1 },
    });
  });
});

describe("csv export", () => {
  test("carries the detected country as the last column", () => {
    const csv = toCoreCsv([
      { user_id: "u", token: "+9000", first_name: null, last_name: null, country: "fr", phone_country: "CA", language: null, segment: null, cohort: null } as never,
    ]);
    const [header, line] = csv.trim().split("\n");
    expect(header).toBe("user_id,phone_e164,first_name,last_name,country,language,segment,cohort,phone_country");
    expect(line).toBe("u,+9000,,,fr,,,,CA");
  });
});
