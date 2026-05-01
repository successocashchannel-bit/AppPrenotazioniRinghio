import { DateTime } from "luxon";
import { supabaseAdmin, maybeSingle } from "@/lib/supabase-admin";
import { getSalonId, salonScopedId } from "@/lib/salon";

export const TIME_ZONE = "Europe/Rome";
export const MIN_ADVANCE_MIN = 60;
export const BUSINESS_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function getBusinessSettingsId() {
  return salonScopedId("settings");
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

export type BusinessSettings = {
  slotMinutes: 15 | 30;
  minAdvanceMin: number;
  closedWeekdays: number[];
  holidays: string[];
  opening: OpeningHours;
};

/**
 * Payload compatibile con la UI vecchia del gestionale e con la web app attuale.
 */
export type BusinessSettingsPayload = {
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
};

type BusinessSettingsRow = {
  id: string;
  salon_id?: string | null;
  slot_minutes: number | null;
  min_advance_min: number | null;
  closed_weekdays: number[] | null;
  holidays: string[] | null;
  morning_enabled: boolean | null;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_enabled: boolean | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
};

export const DEFAULT_SETTINGS: BusinessSettings = {
  slotMinutes: 15,
  minAdvanceMin: 60,
  closedWeekdays: [0, 1],
  holidays: [],
  opening: {
    morning: { enabled: true, start: "09:00", end: "13:00" },
    afternoon: { enabled: true, start: "15:30", end: "20:00" },
  },
};

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeWeekdays(input: unknown): number[] {
  if (!Array.isArray(input)) return [...DEFAULT_SETTINGS.closedWeekdays];

  return Array.from(
    new Set(
      input
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    )
  ).sort((a, b) => a - b);
}

function normalizeHolidays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  return Array.from(
    new Set(
      input
        .map((v) => String(v || "").trim())
        .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    )
  ).sort();
}

function normalizeWindow(
  input: Partial<OpeningWindow> | null | undefined,
  fallback: OpeningWindow
): OpeningWindow {
  return {
    enabled: typeof input?.enabled === "boolean" ? input.enabled : fallback.enabled,
    start: isValidTime(input?.start) ? input.start : fallback.start,
    end: isValidTime(input?.end) ? input.end : fallback.end,
  };
}

export function normalizeSettings(
  input: Partial<BusinessSettings> | null | undefined
): BusinessSettings {
  const slotMinutes = Number(input?.slotMinutes) === 30 ? 30 : 15;
  const rawAdvance = Number(input?.minAdvanceMin);

  return {
    slotMinutes,
    minAdvanceMin:
      Number.isFinite(rawAdvance) && rawAdvance >= 0
        ? Math.floor(rawAdvance)
        : DEFAULT_SETTINGS.minAdvanceMin,
    closedWeekdays: normalizeWeekdays(input?.closedWeekdays),
    holidays: normalizeHolidays(input?.holidays),
    opening: {
      morning: normalizeWindow(
        input?.opening?.morning,
        DEFAULT_SETTINGS.opening.morning
      ),
      afternoon: normalizeWindow(
        input?.opening?.afternoon,
        DEFAULT_SETTINGS.opening.afternoon
      ),
    },
  };
}

/**
 * Ritorna il formato vecchio che la tua UI sta già usando.
 */
export function serializeBusinessSettings(
  settings: BusinessSettings
): BusinessSettingsPayload {
  const normalized = normalizeSettings(settings);

  return {
    slotIntervalMin: normalized.slotMinutes,
    minAdvanceMin: normalized.minAdvanceMin,
    closedWeekdays: normalized.closedWeekdays,
    holidays: normalized.holidays,
    morningEnabled: normalized.opening.morning.enabled,
    morningOpen: normalized.opening.morning.start,
    morningClose: normalized.opening.morning.end,
    afternoonEnabled: normalized.opening.afternoon.enabled,
    afternoonOpen: normalized.opening.afternoon.start,
    afternoonClose: normalized.opening.afternoon.end,
  };
}

/**
 * Accetta il formato vecchio proveniente da gestionale/web app.
 */
export function deserializeBusinessSettings(
  input: Partial<BusinessSettingsPayload> | null | undefined
): BusinessSettings {
  return normalizeSettings({
    slotMinutes: Number(input?.slotIntervalMin) === 30 ? 30 : 15,
    minAdvanceMin: Number(input?.minAdvanceMin),
    closedWeekdays: input?.closedWeekdays,
    holidays: input?.holidays,
    opening: {
      morning: {
        enabled:
          typeof input?.morningEnabled === "boolean"
            ? input.morningEnabled
            : undefined,
        start: input?.morningOpen,
        end: input?.morningClose,
      },
      afternoon: {
        enabled:
          typeof input?.afternoonEnabled === "boolean"
            ? input.afternoonEnabled
            : undefined,
        start: input?.afternoonOpen,
        end: input?.afternoonClose,
      },
    },
  });
}

function rowToSettings(
  row: BusinessSettingsRow | null | undefined
): BusinessSettings {
  if (!row) return normalizeSettings(DEFAULT_SETTINGS);

  return normalizeSettings({
    slotMinutes: row.slot_minutes === 30 ? 30 : 15,
    minAdvanceMin:
      typeof row.min_advance_min === "number"
        ? row.min_advance_min
        : DEFAULT_SETTINGS.minAdvanceMin,
    closedWeekdays: row.closed_weekdays || [],
    holidays: row.holidays || [],
    opening: {
      morning: {
        enabled: !!row.morning_enabled,
        start: row.morning_start || DEFAULT_SETTINGS.opening.morning.start,
        end: row.morning_end || DEFAULT_SETTINGS.opening.morning.end,
      },
      afternoon: {
        enabled: !!row.afternoon_enabled,
        start: row.afternoon_start || DEFAULT_SETTINGS.opening.afternoon.start,
        end: row.afternoon_end || DEFAULT_SETTINGS.opening.afternoon.end,
      },
    },
  });
}

function settingsToRow(settings: BusinessSettings): BusinessSettingsRow {
  const normalized = normalizeSettings(settings);

  return {
    id: getBusinessSettingsId(),
    salon_id: getSalonId(),
    slot_minutes: normalized.slotMinutes,
    min_advance_min: normalized.minAdvanceMin,
    closed_weekdays: normalized.closedWeekdays,
    holidays: normalized.holidays,
    morning_enabled: normalized.opening.morning.enabled,
    morning_start: normalized.opening.morning.start,
    morning_end: normalized.opening.morning.end,
    afternoon_enabled: normalized.opening.afternoon.enabled,
    afternoon_start: normalized.opening.afternoon.start,
    afternoon_end: normalized.opening.afternoon.end,
  };
}

async function ensureSettingsRow() {
  const existing = await maybeSingle(
    supabaseAdmin
      .from("business_settings")
      .select("*")
       .eq("salon_id", getSalonId())
  );

  if (!existing) {
    const { error } = await supabaseAdmin
      .from("business_settings")
      .insert(settingsToRow(DEFAULT_SETTINGS));

    if (error) throw error;
  }
}

export async function readBusinessSettings(): Promise<BusinessSettings> {
  await ensureSettingsRow();

  const data = await maybeSingle(
    supabaseAdmin
      .from("business_settings")
      .select("*")
       .eq("salon_id", getSalonId())
  );

  return rowToSettings(data as BusinessSettingsRow | null | undefined);
}

export async function saveBusinessSettings(
  input: Partial<BusinessSettings>
): Promise<BusinessSettings> {
  const current = await readBusinessSettings();

  const normalized = normalizeSettings({
    ...current,
    ...input,
    opening: {
      morning: {
        ...current.opening.morning,
        ...(input?.opening?.morning || {}),
      },
      afternoon: {
        ...current.opening.afternoon,
        ...(input?.opening?.afternoon || {}),
      },
    },
  });

  const { error } = await supabaseAdmin
    .from("business_settings")
    .upsert(settingsToRow(normalized), { onConflict: "salon_id" });

  if (error) throw error;

  return normalized;
}

export function weekdayNumberFromISO(dateISO: string) {
  const dt = DateTime.fromISO(dateISO, { zone: TIME_ZONE });
  if (!dt.isValid) return -1;
  return dt.weekday % 7;
}

export function isClosedDate(
  dateISO: string,
  settings: Pick<BusinessSettings, "closedWeekdays" | "holidays">
) {
  const dt = DateTime.fromISO(dateISO, { zone: TIME_ZONE });
  if (!dt.isValid) return true;

  const weekday = dt.weekday % 7;
  return (
    settings.closedWeekdays.includes(weekday) ||
    settings.holidays.includes(dateISO)
  );
}

export function toMinutes(hhmm: string) {
  const [h, m] = String(hhmm || "00:00")
    .split(":")
    .map(Number);

  return h * 60 + m;
}

export function addMinutesToHHMM(hhmm: string, minutesToAdd: number) {
  const total = toMinutes(hhmm) + minutesToAdd;
  const h = Math.floor(total / 60);
  const m = total % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isAtLeastMinutesAhead(
  dateOrDateTimeISO: string,
  timeOrMinAdvance?: string | number,
  maybeMinAdvance?: number
) {
  const now = DateTime.now().setZone(TIME_ZONE);
  let slot: DateTime;
  let minAdvance = MIN_ADVANCE_MIN;

  if (typeof timeOrMinAdvance === "number") {
    minAdvance = timeOrMinAdvance;
    slot = DateTime.fromISO(dateOrDateTimeISO, { zone: TIME_ZONE });
  } else {
    minAdvance =
      typeof maybeMinAdvance === "number"
        ? maybeMinAdvance
        : MIN_ADVANCE_MIN;
    slot = DateTime.fromISO(`${dateOrDateTimeISO}T${timeOrMinAdvance}`, {
      zone: TIME_ZONE,
    });
  }

  if (!slot.isValid) return false;
  return slot.diff(now, "minutes").minutes >= minAdvance;
}

export function fitsInsideOpeningHours(
  _dateISO: string,
  timeHHMM: string,
  durationMin: number,
  opening: OpeningHours
) {
  const startMin = toMinutes(timeHHMM);
  const endMin = startMin + durationMin;
  const windows = [opening.morning, opening.afternoon];

  return windows.some(
    (w) =>
      w.enabled &&
      startMin >= toMinutes(w.start) &&
      endMin <= toMinutes(w.end)
  );
}

export function fitsInsideWorkingWindows(
  dateISO: string,
  timeHHMM: string,
  durationMin: number,
  settings: BusinessSettings
) {
  if (isClosedDate(dateISO, settings)) return false;
  return fitsInsideOpeningHours(dateISO, timeHHMM, durationMin, settings.opening);
}

function buildSlotsForWindow(start: string, end: string, stepMinutes: number) {
  const result: string[] = [];
  let current = start;

  while (toMinutes(current) < toMinutes(end)) {
    result.push(current);
    current = addMinutesToHHMM(current, stepMinutes);
  }

  return result;
}

export function generateCandidateSlots(
  dateISO: string,
  durationOrSettings: number | BusinessSettings,
  maybeSettings?: BusinessSettings,
  options?: { ignoreMinAdvance?: boolean }
) {
  let durationMin = 0;
  let settings: BusinessSettings;

  if (typeof durationOrSettings === "number") {
    durationMin = durationOrSettings;
    settings = maybeSettings as BusinessSettings;
  } else {
    settings = durationOrSettings;
  }

  if (!settings || isClosedDate(dateISO, settings)) return [];

  const step = settings.slotMinutes;
  const raw: string[] = [];

  if (settings.opening.morning.enabled) {
    raw.push(
      ...buildSlotsForWindow(
        settings.opening.morning.start,
        settings.opening.morning.end,
        step
      )
    );
  }

  if (settings.opening.afternoon.enabled) {
    raw.push(
      ...buildSlotsForWindow(
        settings.opening.afternoon.start,
        settings.opening.afternoon.end,
        step
      )
    );
  }

  return raw.filter((slot) => {
    const minAdvanceToApply = options?.ignoreMinAdvance ? 0 : settings.minAdvanceMin;
    if (!isAtLeastMinutesAhead(dateISO, slot, minAdvanceToApply)) {
      return false;
    }

    if (durationMin > 0) {
      return fitsInsideWorkingWindows(dateISO, slot, durationMin, settings);
    }

    return true;
  });
}