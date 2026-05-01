import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  DEFAULT_SETTINGS,
  type OpeningHours,
  type OpeningWindow,
  weekdayNumberFromISO,
  fitsInsideOpeningHours,
} from "@/lib/business-settings";
import { getSalonId, matchesSalonScopedId, salonScopedId } from "@/lib/salon";

export type CollaboratorAvailability = {
  weeklyOffDays: number[];
  holidays: string[];
  opening: OpeningHours;
};

export type CollaboratorItem = {
  id: string;
  name: string;
  active: boolean;
  calendarId?: string;
  color?: string;
  availability: CollaboratorAvailability;
};

export type CollaboratorPayload = {
  id: string;
  salon_id?: string;
  name: string;
  active: boolean;
  calendarId?: string;
  color?: string;
  weeklyOffDays: number[];
  holidays: string[];
  morningEnabled: boolean;
  morningOpen: string;
  morningClose: string;
  afternoonEnabled: boolean;
  afternoonOpen: string;
  afternoonClose: string;
};

export const MAX_COLLABORATORS = 1;

function defaultAvailability(): CollaboratorAvailability {
  return {
    weeklyOffDays: [],
    holidays: [],
    opening: {
      morning: { ...DEFAULT_SETTINGS.opening.morning },
      afternoon: { ...DEFAULT_SETTINGS.opening.afternoon },
    },
  };
}

export function getDefaultCollaborators(): Record<string, CollaboratorItem> {
  const id = salonScopedId("collaboratore_1");
  return {
    [id]: {
      id,
    name: "Operatore",
    active: true,
    calendarId: "",
    color: "",
    availability: defaultAvailability(),
  },
  };
}

type CollaboratorRow = {
  id: string;
  salon_id?: string | null;
  name: string;
  active: boolean;
  calendar_id: string | null;
  color: string | null;
  weekly_off_days: number[] | null;
  holidays: string[] | null;
  morning_enabled: boolean | null;
  morning_start?: string | null;
  morning_end?: string | null;
  morning_open?: string | null;
  morning_close?: string | null;
  afternoon_enabled: boolean | null;
  afternoon_start?: string | null;
  afternoon_end?: string | null;
  afternoon_open?: string | null;
  afternoon_close?: string | null;
  updated_at?: string;
};

function slugify(text: string) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function normalizeWeekdays(input: unknown): number[] {
  if (!Array.isArray(input)) return [];

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

function normalizeAvailability(
  input: Partial<CollaboratorAvailability> | null | undefined
): CollaboratorAvailability {
  const fallback = defaultAvailability();

  return {
    weeklyOffDays: normalizeWeekdays(input?.weeklyOffDays),
    holidays: normalizeHolidays(input?.holidays),
    opening: {
      morning: normalizeWindow(input?.opening?.morning, fallback.opening.morning),
      afternoon: normalizeWindow(input?.opening?.afternoon, fallback.opening.afternoon),
    },
  };
}

function sanitizeCollaborator(
  input: Partial<CollaboratorItem>,
  fallbackId?: string
): CollaboratorItem {
  const name = String(input.name || "").trim() || "Collaboratore";
  const id = slugify(String(input.id || fallbackId || name)) || `collaboratore_${Date.now()}`;

  return {
    id,
    name,
    active: input.active !== false,
    calendarId: String(input.calendarId || "").trim(),
    color: String(input.color || "").trim(),
    availability: normalizeAvailability(input.availability),
  };
}

function fromRow(row: CollaboratorRow): CollaboratorItem {
  const morningStart =
    row.morning_start ||
    row.morning_open ||
    DEFAULT_SETTINGS.opening.morning.start;

  const morningEnd =
    row.morning_end ||
    row.morning_close ||
    DEFAULT_SETTINGS.opening.morning.end;

  const afternoonStart =
    row.afternoon_start ||
    row.afternoon_open ||
    DEFAULT_SETTINGS.opening.afternoon.start;

  const afternoonEnd =
    row.afternoon_end ||
    row.afternoon_close ||
    DEFAULT_SETTINGS.opening.afternoon.end;

  return sanitizeCollaborator(
    {
      id: row.id,
      name: row.name,
      active: row.active,
      calendarId: row.calendar_id || "",
      color: row.color || "",
      availability: {
        weeklyOffDays: row.weekly_off_days || [],
        holidays: row.holidays || [],
        opening: {
          morning: {
            enabled: row.morning_enabled ?? DEFAULT_SETTINGS.opening.morning.enabled,
            start: morningStart,
            end: morningEnd,
          },
          afternoon: {
            enabled: row.afternoon_enabled ?? DEFAULT_SETTINGS.opening.afternoon.enabled,
            start: afternoonStart,
            end: afternoonEnd,
          },
        },
      },
    },
    row.id
  );
}

function toRow(item: CollaboratorItem): CollaboratorRow {
  const normalized = sanitizeCollaborator(item, item.id);

  return {
    id: normalized.id,
    salon_id: getSalonId(),
    name: normalized.name,
    active: normalized.active,
    calendar_id: String(normalized.calendarId || "").trim() || null,
    color: String(normalized.color || "").trim() || null,
    weekly_off_days: normalized.availability.weeklyOffDays,
    holidays: normalized.availability.holidays,
    morning_enabled: normalized.availability.opening.morning.enabled,
    morning_start: normalized.availability.opening.morning.start,
    morning_end: normalized.availability.opening.morning.end,
    morning_open: normalized.availability.opening.morning.start,
    morning_close: normalized.availability.opening.morning.end,
    afternoon_enabled: normalized.availability.opening.afternoon.enabled,
    afternoon_start: normalized.availability.opening.afternoon.start,
    afternoon_end: normalized.availability.opening.afternoon.end,
    afternoon_open: normalized.availability.opening.afternoon.start,
    afternoon_close: normalized.availability.opening.afternoon.end,
  };
}

function normalizeCollaborators(input: any): Record<string, CollaboratorItem> {
  if (!input || typeof input !== "object") return getDefaultCollaborators();

  const result: Record<string, CollaboratorItem> = {};

  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(result).length >= MAX_COLLABORATORS) break;
    const item = sanitizeCollaborator(value as Partial<CollaboratorItem>, key);
    item.id = salonScopedId(item.id);
    result[item.id] = item;
  }

  return Object.keys(result).length ? result : getDefaultCollaborators();
}

export function serializeCollaborator(item: CollaboratorItem): CollaboratorPayload {
  const normalized = sanitizeCollaborator(item, item.id);

  return {
    id: normalized.id,
    salon_id: getSalonId(),
    name: normalized.name,
    active: normalized.active,
    calendarId: normalized.calendarId || "",
    color: normalized.color || "",
    weeklyOffDays: normalized.availability.weeklyOffDays,
    holidays: normalized.availability.holidays,
    morningEnabled: normalized.availability.opening.morning.enabled,
    morningOpen: normalized.availability.opening.morning.start,
    morningClose: normalized.availability.opening.morning.end,
    afternoonEnabled: normalized.availability.opening.afternoon.enabled,
    afternoonOpen: normalized.availability.opening.afternoon.start,
    afternoonClose: normalized.availability.opening.afternoon.end,
  };
}

export function deserializeCollaborator(
  input: Partial<CollaboratorPayload>
): CollaboratorItem {
  const collaborator = sanitizeCollaborator(
    {
      id: input.id,
      name: input.name,
      active: input.active,
      calendarId: input.calendarId,
      color: input.color,
      availability: {
        weeklyOffDays: input.weeklyOffDays,
        holidays: input.holidays,
        opening: {
          morning: {
            enabled: input.morningEnabled,
            start: input.morningOpen,
            end: input.morningClose,
          },
          afternoon: {
            enabled: input.afternoonEnabled,
            start: input.afternoonOpen,
            end: input.afternoonClose,
          },
        },
      },
    },
    input.id
  );

  collaborator.id = salonScopedId(collaborator.id);
  return collaborator;
}

async function seedDefaultCollaboratorsIfEmpty() {
  const { data, error } = await supabaseAdmin
    .from("collaborators")
    .select("id")
    .eq("salon_id", getSalonId())
    .limit(1);

  if (error) throw error;

  if ((data || []).length === 0) {
    const rows = Object.values(getDefaultCollaborators()).map(toRow);
    const upsert = await supabaseAdmin
      .from("collaborators")
      .upsert(rows, { onConflict: "id" });

    if (upsert.error) throw upsert.error;
  }
}

export async function readCollaboratorsMap() {
  await seedDefaultCollaboratorsIfEmpty();

  const { data, error } = await supabaseAdmin.from("collaborators").select("*").eq("salon_id", getSalonId());
  if (error) throw error;

  const result: Record<string, CollaboratorItem> = {};

  for (const row of (data || []) as CollaboratorRow[]) {
    const item = fromRow(row);
    result[item.id] = item;
  }

  return Object.keys(result).length ? result : getDefaultCollaborators();
}

export async function saveCollaboratorsMap(input: Record<string, CollaboratorItem>) {
  const normalized = normalizeCollaborators(input);

  if (Object.keys(normalized).length > MAX_COLLABORATORS) {
    throw new Error(`Questo gestionale è configurato per 1 solo operatore`);
  }

  const rows = Object.values(normalized).map(toRow);

  const existing = await supabaseAdmin.from("collaborators").select("id").eq("salon_id", getSalonId());
  if (existing.error) throw existing.error;

  const keepIds = new Set(rows.map((item) => item.id));
  const deleteIds = (existing.data || [])
    .map((item: any) => item.id)
    .filter((id: string) => !keepIds.has(id));

  if (deleteIds.length) {
    const deleted = await supabaseAdmin
      .from("collaborators")
      .delete()
      .eq("salon_id", getSalonId())
      .in("id", deleteIds);

    if (deleted.error) throw deleted.error;
  }

  const upsert = await supabaseAdmin
    .from("collaborators")
    .upsert(rows, { onConflict: "id" });

  if (upsert.error) throw upsert.error;

  return normalized;
}

export async function readCollaboratorsList(includeInactive = false) {
  const map = await readCollaboratorsMap();
  const list = Object.values(map).sort((a, b) => {
    const aPrimary = a.id.endsWith("collaboratore_1") || a.id === "collaboratore_1" ? -1 : 0;
    const bPrimary = b.id.endsWith("collaboratore_1") || b.id === "collaboratore_1" ? -1 : 0;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return a.name.localeCompare(b.name, "it");
  }).slice(0, 1);
  return includeInactive ? list : list.filter((item) => item.active);
}

export async function getCollaboratorById(collaboratorId: string) {
  const normalizedId = String(collaboratorId || "").trim().toLowerCase();
  if (!normalizedId) return null;

  const { data, error } = await supabaseAdmin
    .from("collaborators")
    .select("*")
     .eq("salon_id", getSalonId())
    .in("id", [normalizedId, salonScopedId(normalizedId)])
    .limit(1);

  if (error) throw error;

  const rows = (data || []) as CollaboratorRow[];
  const row = rows.find((entry) => matchesSalonScopedId(entry.id, normalizedId)) || rows[0];
  return row ? fromRow(row) : null;
}

export async function upsertCollaborator(
  input: Partial<CollaboratorPayload | CollaboratorItem>
) {
  const all = await readCollaboratorsList(true);

  const normalizedId = String((input as any).id || "")
    .trim()
    .toLowerCase();

  const isNew = !normalizedId || !all.some((item) => matchesSalonScopedId(item.id, normalizedId));

  if (isNew && all.length >= MAX_COLLABORATORS) {
    throw new Error(`Questo gestionale è configurato per 1 solo operatore`);
  }

  const item =
    "weeklyOffDays" in (input || {}) || "morningEnabled" in (input || {})
      ? deserializeCollaborator(input as Partial<CollaboratorPayload>)
      : (() => {
          const normalized = sanitizeCollaborator(
            input as Partial<CollaboratorItem>,
            (input as any).id
          );
          normalized.id = salonScopedId(normalized.id);
          return normalized;
        })();

  const { error } = await supabaseAdmin
    .from("collaborators")
    .upsert(toRow(item), { onConflict: "id" });

  if (error) throw error;

  return item;
}

export async function deleteCollaborator(collaboratorId: string) {
  const normalizedId = String(collaboratorId || "").trim().toLowerCase();
  if (!normalizedId) return;

  const all = await readCollaboratorsList(true);

  if (all.length <= 1) {
    throw new Error("Questo gestionale deve mantenere l’unico operatore attivo");
  }

  const { error } = await supabaseAdmin
    .from("collaborators")
    .delete()
     .eq("salon_id", getSalonId())
    .in("id", [normalizedId, salonScopedId(normalizedId)]);

  if (error) throw error;
}

export function isCollaboratorOffOnDate(
  collaborator: CollaboratorItem,
  dateISO: string
) {
  const weekday = weekdayNumberFromISO(dateISO);
  return (
    collaborator.availability.weeklyOffDays.includes(weekday) ||
    collaborator.availability.holidays.includes(dateISO)
  );
}

export function collaboratorFitsWorkingWindows(
  collaborator: CollaboratorItem,
  dateISO: string,
  timeHHMM: string,
  durationMin: number
) {
  if (isCollaboratorOffOnDate(collaborator, dateISO)) return false;

  return fitsInsideOpeningHours(
    dateISO,
    timeHHMM,
    durationMin,
    collaborator.availability.opening
  );
}