export const DEFAULT_SALON_ID = "salone_1";

export function getSalonId(): string {
  const value =
    process.env.NEXT_PUBLIC_SALON_ID ||
    process.env.SALON_ID ||
    DEFAULT_SALON_ID;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || DEFAULT_SALON_ID;
}

export function salonScopedId(id: string): string {
  const normalized = String(id || "").trim().toLowerCase();
  const salonId = getSalonId();
  if (!normalized) return `${salonId}_item`;
  if (normalized.startsWith(`${salonId}_`)) return normalized;
  return `${salonId}_${normalized}`;
}

export function matchesSalonScopedId(value: unknown, rawId: string): boolean {
  const candidate = String(value || "").trim().toLowerCase();
  const normalizedRaw = String(rawId || "").trim().toLowerCase();
  if (!candidate || !normalizedRaw) return false;
  return candidate === normalizedRaw || candidate === salonScopedId(normalizedRaw);
}
