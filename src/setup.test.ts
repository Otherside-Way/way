import { beforeEach, describe, expect, test } from "bun:test";
import { deleteSetting, getSetting } from "./db";
import { keys } from "./keys";
import { beginSetup, completeSetup, endSetup, setupPending } from "./setup";
import { changeLogin } from "./key-settings";

beforeEach(() => {
  deleteSetting("setup_code");
});

describe("first login with the install code", () => {
  test("nothing is pending until the installer hands the code over", () => {
    expect(setupPending()).toBe(false);
    expect(completeSetup("HN-CODE-1234", "a-good-password")).toBe(false);
  });

  test("the code is kept only as a hash", () => {
    beginSetup("HN-CODE-1234");
    expect(setupPending()).toBe(true);
    expect(getSetting("setup_code")).not.toContain("HN-CODE-1234");
  });

  test("a wrong code changes nothing", () => {
    beginSetup("HN-CODE-1234");
    const before = keys.cabinetPassword();
    expect(completeSetup("HN-CODE-9999", "a-good-password")).toBe(false);
    expect(setupPending()).toBe(true);
    expect(keys.cabinetPassword()).toBe(before);
  });

  test("a short password is refused and the code stays usable", () => {
    beginSetup("HN-CODE-1234");
    expect(() => completeSetup("HN-CODE-1234", "short")).toThrow(/8 characters/);
    expect(setupPending()).toBe(true);
  });

  test("the right code sets the password once and is spent", () => {
    beginSetup(" HN-CODE-1234 ");
    expect(completeSetup("HN-CODE-1234", "a-good-password")).toBe(true);
    expect(keys.cabinetPassword()).toBe("a-good-password");
    expect(setupPending()).toBe(false);
    expect(completeSetup("HN-CODE-1234", "another-password")).toBe(false);
    expect(keys.cabinetPassword()).toBe("a-good-password");
  });
});

describe("the install code stops opening the cabinet once a password is in use", () => {
  test("changing the login spends it", () => {
    beginSetup("HN-CODE-1234");
    changeLogin("admin", "a-chosen-password");
    expect(setupPending()).toBe(false);
  });

  test("a sign-in with the password spends it", () => {
    beginSetup("HN-CODE-1234");
    endSetup();
    expect(setupPending()).toBe(false);
    expect(completeSetup("HN-CODE-1234", "another-password")).toBe(false);
  });
});
