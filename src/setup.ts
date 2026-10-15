import { createHash } from "crypto";
import { deleteSetting, getSetting, setSetting } from "./db";
import { secretEquals } from "./equals";
import { setCabinetPassword } from "./keys";

const SETUP_KEY = "setup_code";

function digest(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function beginSetup(code: string): void {
  setSetting(SETUP_KEY, digest(code));
}

export function setupPending(): boolean {
  return getSetting(SETUP_KEY) !== null;
}

export function completeSetup(code: string, password: string): boolean {
  if (!secretEquals(digest(code), getSetting(SETUP_KEY))) return false;
  setCabinetPassword(password);
  endSetup();
  return true;
}

export function endSetup(): void {
  deleteSetting(SETUP_KEY);
}
