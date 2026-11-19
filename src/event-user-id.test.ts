import { describe, expect, test } from "bun:test";
import { encryptPhone } from "./fpe";
import { buildEvent } from "./platform";
import { DEFAULT_PLATFORM_FIELDS, PLATFORM_TARGET_FIELDS, platformConfigSchema } from "./webhook";

describe("the platform gets the client's user id", () => {
  const platform = { baseUrl: "https://core.example", slug: "s", apiKey: "k", playerSegment: "seg", eventType: "player.registered", fields: DEFAULT_PLATFORM_FIELDS };
  const real = "+14165550101";
  const token = encryptPhone(real);
  const number = (over: Record<string, unknown>) =>
    ({ id: 9, real, token, segment: null, cohort: null, user_id: "u-777", country: null, phone_country: "CA", language: null, first_name: null, last_name: null, ...over }) as never;
  const request = { call_id: "c-user", number_id: 9, segment: null, cohort: null } as never;

  test("the user id travels in data, the external id stays the call id", () => {
    const event = buildEvent(number({}), request, platform);
    expect(event.data.user_id).toBe("u-777");
    expect(event.player.external_id).toBe("c-user");
  });

  test("a mapping saved before this release still sends the user id", () => {
    const saved = { ...platform, fields: [{ as: "phone_e164" as const, from: "token" as const }] };
    expect(buildEvent(number({}), request, saved).data.user_id).toBe("u-777");
  });

  test("no user id is sent when the number has none", () => {
    expect(buildEvent(number({ user_id: null }), request, platform).data.user_id).toBeUndefined();
  });

  test("a user id that carries the real number is left out and the event still goes", () => {
    const event = buildEvent(number({ user_id: real }), request, platform);
    expect(event.data.user_id).toBeUndefined();
    expect(event.player.phone_e164).toBe(token);
    expect(JSON.stringify(event)).not.toContain(real.slice(-8));
  });

  test("a user id longer than the platform keeps is left out and the event still goes", () => {
    expect(buildEvent(number({ user_id: "x".repeat(256) }), request, platform).data.user_id).toBeUndefined();
    expect(buildEvent(number({ user_id: "x".repeat(255) }), request, platform).data.user_id).toBe("x".repeat(255));
  });

  test("an explicit user_id mapping that carries the real number is still refused", () => {
    const explicit = { ...platform, fields: [...DEFAULT_PLATFORM_FIELDS, { as: "user_id" as const, from: "user_id" as const }] };
    expect(() => buildEvent(number({ user_id: real }), request, explicit)).toThrow(/refusing to send a real phone number/);
  });

  test("an explicit user_id mapping and the implicit one send the value once", () => {
    const explicit = { ...platform, fields: [...DEFAULT_PLATFORM_FIELDS, { as: "user_id" as const, from: "user_id" as const }] };
    const event = buildEvent(number({}), request, explicit);
    expect(event.data.user_id).toBe("u-777");
    expect(Object.keys(event.data).filter((k) => k === "user_id")).toHaveLength(1);
  });

  test("user_id is a target the mapping accepts", () => {
    expect(PLATFORM_TARGET_FIELDS).toContain("user_id");
    const parsed = platformConfigSchema.parse({ ...platform, fields: [...DEFAULT_PLATFORM_FIELDS, { as: "user_id", from: "user_id" }] });
    expect(parsed.fields).toContainEqual({ as: "user_id", from: "user_id" });
  });
});
