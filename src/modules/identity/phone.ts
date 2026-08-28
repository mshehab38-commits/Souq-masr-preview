const EGYPT_MOBILE_PREFIXES = ["10", "11", "12", "15"];

export function normalizeEgyptianPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let national: string;

  if (digits.startsWith("+20")) {
    national = digits.slice(3);
  } else if (digits.startsWith("0020")) {
    national = digits.slice(4);
  } else if (digits.startsWith("20") && digits.length === 12) {
    national = digits.slice(2);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (!/^\d{10}$/.test(national)) return null;
  if (!EGYPT_MOBILE_PREFIXES.includes(national.slice(0, 2))) return null;

  return `+20${national}`;
}

export function formatEgyptianPhoneLocal(e164: string): string {
  const national = e164.replace("+20", "0");
  if (national.length !== 11) return e164;
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}
