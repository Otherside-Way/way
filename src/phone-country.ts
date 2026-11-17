import { parsePhoneNumberFromString } from "libphonenumber-js/min";

export function phoneCountry(real: string | null | undefined): string | null {
  const digits = (real ?? "").replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 15) return null;
  try {
    const parsed = parsePhoneNumberFromString(`+${digits}`);
    if (!parsed?.isPossible()) return null;
    return parsed.country ?? null;
  } catch {
    return null;
  }
}
