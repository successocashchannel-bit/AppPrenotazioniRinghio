import { DateTime } from "luxon";
import { supabaseInsert, supabasePatch, supabaseSelect } from "@/lib/supabase-rest";

export const TIME_ZONE = "Europe/Rome";

export type BusinessSettings = {
  slotIntervalMin: 15 | 30;
  minAdvanceMin: number;
  closedWeekdays: number[];
  holidays: string[];
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
  logoUrl: string;
  icon192: string;
  icon512: string;
  brandTitle: string;
  brandSubtitle: string;
  updatedAt?: string;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  slotIntervalMin: 15,
  minAdvanceMin: 60,
  closedWeekdays: [0, 1],
  holidays: [],
  morningEnabled: true,
  morningOpen: "09:00",
  morningClose: "13:00",
  afternoonEnabled: true,
  afternoonOpen: "15:30",
  afternoonClose: "20:00",
  logoUrl: "",
  icon192: "",
  icon512: "",
  brandTitle: "Prenotazioni Online",
  brandSubtitle: "Prenota il tuo appuntamento in pochi secondi",
};

type SettingsRow = {
  id: string;
  slot_interval_min: number;
  min_advance_min: number;
  closed_weekdays: unknown;
  holidays: unknown;
  morning_enabled: boolean;
  morning_open: string;
  morning_close: string;
  afternoon_enabled: boolean;
  afternoon_open: string;
  afternoon_close: string;
  logo_url?: string | null;
  icon_192?: string | null;
  icon_512?: string | null;
  brand_title?: string | null;
  brand_subtitle?: string | null;
  updated_at?: string | null;
};

function uniqueIsoDates(items: string[]) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
    )
  ).sort();
}

function sanitizeWeekdays(days: unknown): number[] {
  const raw = Array.isArray(days) ? days : [];
  return Array.from(
    new Set(
      raw
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day))
        .map((day) => (day === 7 ? 0 : day))
        .filter((day) => day >= 0 && day <= 6)
    )
  ).sort((a, b) => a - b);
}

function sanitizeTime(value: unknown, fallback: string) {
  const text = String(value || "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : fallback;
}

function sanitizeInterval(value: unknown): 15 | 30 {
  return Number(value) === 30 ? 30 : 15;
}


function sanitizePublicImageUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("blob:")) return "";
  if (text.startsWith("data:")) return "";
  if (
    text.startsWith("/") ||
    text.startsWith("http://") ||
    text.startsWith("https://")
  ) {
    return text;
  }
  return "";
}

export function normalizeSettings(input: Partial<BusinessSettings> | null | undefined): BusinessSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(input || {}),
    slotIntervalMin: sanitizeInterval(input?.slotIntervalMin),
    minAdvanceMin: Math.max(0, Number(input?.minAdvanceMin ?? DEFAULT_SETTINGS.minAdvanceMin) || DEFAULT_SETTINGS.minAdvanceMin),
    closedWeekdays: sanitizeWeekdays(input?.closedWeekdays),
    holidays: uniqueIsoDates((input?.holidays as string[]) || []),
    morningEnabled: Boolean(input?.morningEnabled ?? DEFAULT_SETTINGS.morningEnabled),
    morningOpen: sanitizeTime(input?.morningOpen, DEFAULT_SETTINGS.morningOpen),
    morningClose: sanitizeTime(input?.morningClose, DEFAULT_SETTINGS.morningClose),
    afternoonEnabled: Boolean(input?.afternoonEnabled ?? DEFAULT_SETTINGS.afternoonEnabled),
    afternoonOpen: sanitizeTime(input?.afternoonOpen, DEFAULT_SETTINGS.afternoonOpen),
    afternoonClose: sanitizeTime(input?.afternoonClose, DEFAULT_SETTINGS.afternoonClose),
    logoUrl: sanitizePublicImageUrl((input as any)?.logoUrl),
    icon192: sanitizePublicImageUrl((input as any)?.icon192),
    icon512: sanitizePublicImageUrl((input as any)?.icon512),
    brandTitle: String((input as any)?.brandTitle || DEFAULT_SETTINGS.brandTitle).trim() || DEFAULT_SETTINGS.brandTitle,
    brandSubtitle: String((input as any)?.brandSubtitle || DEFAULT_SETTINGS.brandSubtitle).trim() || DEFAULT_SETTINGS.brandSubtitle,
    updatedAt: String((input as any)?.updatedAt || '').trim() || undefined,
  };
}

function rowToSettings(row: SettingsRow | null | undefined): BusinessSettings {
  if (!row) return DEFAULT_SETTINGS;
  return normalizeSettings({
    slotIntervalMin: sanitizeInterval(row.slot_interval_min),
    minAdvanceMin: row.min_advance_min,
    closedWeekdays: sanitizeWeekdays(row.closed_weekdays),
    holidays: uniqueIsoDates(Array.isArray(row.holidays) ? (row.holidays as string[]) : []),
    morningEnabled: Boolean(row.morning_enabled),
    morningOpen: row.morning_open,
    morningClose: row.morning_close,
    afternoonEnabled: Boolean(row.afternoon_enabled),
    afternoonOpen: row.afternoon_open,
    afternoonClose: row.afternoon_close,
    logoUrl: sanitizePublicImageUrl(row.logo_url),
    icon192: sanitizePublicImageUrl(row.icon_192),
    icon512: sanitizePublicImageUrl(row.icon_512),
    brandTitle: String(row.brand_title || DEFAULT_SETTINGS.brandTitle),
    brandSubtitle: String(row.brand_subtitle || DEFAULT_SETTINGS.brandSubtitle),
    updatedAt: String(row.updated_at || '').trim() || undefined,
  });
}

function settingsToRow(input: BusinessSettings) {
  return {
    slot_interval_min: input.slotIntervalMin,
    min_advance_min: input.minAdvanceMin,
    closed_weekdays: input.closedWeekdays,
    holidays: input.holidays,
    morning_enabled: input.morningEnabled,
    morning_open: input.morningOpen,
    morning_close: input.morningClose,
    afternoon_enabled: input.afternoonEnabled,
    afternoon_open: input.afternoonOpen,
    afternoon_close: input.afternoonClose,
    logo_url: input.logoUrl,
    icon_192: input.icon192,
    icon_512: input.icon512,
    brand_title: input.brandTitle,
    brand_subtitle: input.brandSubtitle,
  };
}

async function readSettingsRow(): Promise<SettingsRow | null> {
  const rows = await supabaseSelect<SettingsRow[]>("business_settings", {
    select: "*",
    order: "id.asc",
    limit: 1,
  });
  return rows?.[0] || null;
}

export async function readBusinessSettings(): Promise<BusinessSettings> {
  try {
    const row = await readSettingsRow();
    return rowToSettings(row);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveBusinessSettings(input: Partial<BusinessSettings>) {
  const normalized = normalizeSettings(input);
  const currentRow = await readSettingsRow();

  if (currentRow?.id) {
    const rows = await supabasePatch<SettingsRow[]>(
      "business_settings",
      { id: currentRow.id },
      settingsToRow(normalized)
    );
    return rowToSettings(rows?.[0] || currentRow);
  }

  const rows = await supabaseInsert<SettingsRow[]>("business_settings", settingsToRow(normalized));
  return rowToSettings(rows?.[0]);
}

export function isClosedDate(dateStr: string, settings: BusinessSettings) {
  const date = DateTime.fromISO(dateStr, { zone: TIME_ZONE });
  if (!date.isValid) return true;
  const jsWeekday = date.weekday % 7;
  return settings.closedWeekdays.includes(jsWeekday) || settings.holidays.includes(dateStr);
}

export function toDateTime(dateStr: string, timeStr: string) {
  return DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: TIME_ZONE });
}

export function getDailyWindows(dateStr: string, settings: BusinessSettings) {
  const windows: { key: string; start: string; end: string }[] = [];

  if (settings.morningEnabled) {
    windows.push({ key: "morning", start: settings.morningOpen, end: settings.morningClose });
  }

  if (settings.afternoonEnabled) {
    windows.push({ key: "afternoon", start: settings.afternoonOpen, end: settings.afternoonClose });
  }

  return windows.filter((item) => {
    const start = toDateTime(dateStr, item.start);
    const end = toDateTime(dateStr, item.end);
    return start.isValid && end.isValid && end.toMillis() > start.toMillis();
  });
}

export function generateCandidateSlots(
  dateStr: string,
  durationOrSettings: number | BusinessSettings,
  maybeSettings?: BusinessSettings
) {
  let settings: BusinessSettings;

  if (typeof durationOrSettings === "number") {
    settings = maybeSettings as BusinessSettings;
  } else {
    settings = durationOrSettings;
  }

  if (!settings) {
    return [];
  }

  const slots: string[] = [];

  for (const window of getDailyWindows(dateStr, settings)) {
    let current = toDateTime(dateStr, window.start);
    const end = toDateTime(dateStr, window.end);

    while (current < end) {
      slots.push(current.toFormat("HH:mm"));
      current = current.plus({ minutes: settings.slotIntervalMin });
    }
  }

  return slots;
}

export function fitsInsideWorkingWindows(
  dateStr: string,
  startTime: string,
  durationMin: number,
  settings: BusinessSettings
) {
  const start = toDateTime(dateStr, startTime);
  const end = start.plus({ minutes: durationMin });

  if (!start.isValid || !end.isValid) return false;

  return getDailyWindows(dateStr, settings).some((window) => {
    const windowStart = toDateTime(dateStr, window.start);
    const windowEnd = toDateTime(dateStr, window.end);
    return start.toMillis() >= windowStart.toMillis() && end.toMillis() <= windowEnd.toMillis();
  });
}

export function isAtLeastMinutesAhead(
  startISOOrDate: string,
  timeOrMinutes: string | number,
  maybeMinutes?: number
) {
  let startISO: string;
  let minutes: number;

  if (typeof timeOrMinutes === "string") {
    startISO = toDateTime(startISOOrDate, timeOrMinutes).toISO() || "";
    minutes = Number(maybeMinutes || 0);
  } else {
    startISO = startISOOrDate;
    minutes = Number(timeOrMinutes || 0);
  }

  const start = DateTime.fromISO(startISO, { zone: TIME_ZONE });
  const now = DateTime.now().setZone(TIME_ZONE);

  if (!start.isValid) return false;

  return start.toMillis() >= now.plus({ minutes }).toMillis();
}

export function toMinutes(timeHHMM: string) {
  const [hours, minutes] = String(timeHHMM || "").split(":").map((value) => Number(value));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function addMinutesToHHMM(timeHHMM: string, minutesToAdd: number) {
  const total = toMinutes(timeHHMM) + Number(minutesToAdd || 0);
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function weekdayNumberFromISO(dateStr: string) {
  const date = DateTime.fromISO(dateStr, { zone: TIME_ZONE });
  return date.isValid ? date.weekday : 1;
}

export type OpeningWindow = {
  enabled: boolean;
  start: string;
  end: string;
};

export type OpeningHours = {
  morning: OpeningWindow;
  afternoon: OpeningWindow;
};

export function fitsInsideOpeningHours(
  dateStr: string,
  startTime: string,
  durationMin: number,
  opening: OpeningHours
) {
  const settingsLike: BusinessSettings = {
    ...DEFAULT_SETTINGS,
    morningEnabled: Boolean(opening?.morning?.enabled),
    morningOpen: String(opening?.morning?.start || DEFAULT_SETTINGS.morningOpen),
    morningClose: String(opening?.morning?.end || DEFAULT_SETTINGS.morningClose),
    afternoonEnabled: Boolean(opening?.afternoon?.enabled),
    afternoonOpen: String(opening?.afternoon?.start || DEFAULT_SETTINGS.afternoonOpen),
    afternoonClose: String(opening?.afternoon?.end || DEFAULT_SETTINGS.afternoonClose),
  };

  return fitsInsideWorkingWindows(dateStr, startTime, durationMin, settingsLike);
}
