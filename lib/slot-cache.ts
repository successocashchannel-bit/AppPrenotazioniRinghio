import { getSalonId } from "@/lib/salon";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SlotCacheValue = {
  settings: any;
  slots: any[];
};

type TimedEntry<T> = { expiresAt: number; value: T };

const SLOT_RESULT_CACHE_TTL_MS = 60_000;
const BUSY_EVENTS_CACHE_TTL_MS = 60_000;

const slotsResultCache = new Map<string, TimedEntry<SlotCacheValue>>();
const inflightSlotsRequests = new Map<string, Promise<SlotCacheValue>>();
const busyEventsDayCache = new Map<string, TimedEntry<any[]>>();

type PersistentSlotCacheRow = {
  settings_json?: any;
  slots_json?: any;
};

const PERSISTENT_SLOT_CACHE_ENABLED =
  String(process.env.ENABLE_DAILY_SLOT_CACHE || "true").trim().toLowerCase() !== "false";
let persistentTableAvailability: boolean | null = null;

function isMissingRelationError(error: any) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  const code = String(error?.code || "").trim();
  return code === "42P01" || (message.includes("daily_slot_cache") && message.includes("does not exist"));
}

async function hasPersistentSlotCacheTable() {
  if (!PERSISTENT_SLOT_CACHE_ENABLED) return false;
  if (persistentTableAvailability !== null) return persistentTableAvailability;

  const { error } = await supabaseAdmin
    .from("daily_slot_cache")
    .select("salon_id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    if (isMissingRelationError(error)) {
      persistentTableAvailability = false;
      return false;
    }
    console.warn("daily_slot_cache check failed", error);
    persistentTableAvailability = false;
    return false;
  }

  persistentTableAvailability = true;
  return true;
}

function buildPersistentArgsFromCacheKey(cacheKey: string) {
  const [salonId, date, serviceId, peopleCount, preferredCollaboratorId, mode] = String(cacheKey || "").split("__");
  return {
    salonId: normalize(salonId || getSalonId()),
    date: String(date || "").trim(),
    serviceId: normalize(serviceId),
    peopleCount: Math.max(1, Math.min(5, Number(peopleCount) || 1)),
    preferredCollaboratorId: normalize(preferredCollaboratorId),
    ignoreMinAdvance: mode === "admin",
  };
}

function rowToSlotCacheValue(row: PersistentSlotCacheRow | null | undefined): SlotCacheValue | null {
  if (!row) return null;
  return {
    settings: row.settings_json || null,
    slots: Array.isArray(row.slots_json) ? row.slots_json : [],
  };
}

export async function readPersistentSlotsResultCache(cacheKey: string) {
  const tableAvailable = await hasPersistentSlotCacheTable();
  if (!tableAvailable) return null;

  const args = buildPersistentArgsFromCacheKey(cacheKey);
  let query = supabaseAdmin
    .from("daily_slot_cache")
    .select("settings_json, slots_json, updated_at")
    .eq("salon_id", args.salonId)
    .eq("date", args.date)
    .eq("service_id", args.serviceId)
    .eq("people_count", args.peopleCount)
    .eq("ignore_min_advance", args.ignoreMinAdvance);

  query = args.preferredCollaboratorId
    ? query.eq("preferred_collaborator_id", args.preferredCollaboratorId)
    : query.is("preferred_collaborator_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) {
      persistentTableAvailability = false;
      return null;
    }
    console.warn("daily_slot_cache read failed", error);
    return null;
  }
  return rowToSlotCacheValue(data as PersistentSlotCacheRow | null);
}

export async function writePersistentSlotsResultCache(cacheKey: string, value: SlotCacheValue) {
  const tableAvailable = await hasPersistentSlotCacheTable();
  if (!tableAvailable) return;

  const args = buildPersistentArgsFromCacheKey(cacheKey);
  const payload = {
    salon_id: args.salonId,
    date: args.date,
    service_id: args.serviceId,
    people_count: args.peopleCount,
    preferred_collaborator_id: args.preferredCollaboratorId || null,
    ignore_min_advance: args.ignoreMinAdvance,
    settings_json: value.settings ?? null,
    slots_json: Array.isArray(value.slots) ? value.slots : [],
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("daily_slot_cache")
    .upsert(payload, {
      onConflict: "salon_id,date,service_id,people_count,preferred_collaborator_id,ignore_min_advance",
    });

  if (error) {
    if (isMissingRelationError(error)) {
      persistentTableAvailability = false;
      return;
    }
    console.warn("daily_slot_cache write failed", error);
  }
}

async function invalidatePersistentSlotsCache(args?: { salonId?: string; date?: string | null }) {
  const tableAvailable = await hasPersistentSlotCacheTable();
  if (!tableAvailable) return;

  let query = supabaseAdmin
    .from("daily_slot_cache")
    .delete()
    .eq("salon_id", normalize(args?.salonId || getSalonId()));

  if (args?.date) {
    query = query.eq("date", String(args.date).trim());
  }

  const { error } = await query;
  if (error) {
    if (isMissingRelationError(error)) {
      persistentTableAvailability = false;
      return;
    }
    console.warn("daily_slot_cache invalidate failed", error);
  }
}

function now() {
  return Date.now();
}

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanup<T>(cache: Map<string, TimedEntry<T>>) {
  const current = now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= current) cache.delete(key);
  }
}

export function buildSlotsCacheKey(args: {
  date: string;
  serviceId: string;
  peopleCount: number;
  preferredCollaboratorId?: string | null;
  ignoreMinAdvance?: boolean;
  salonId?: string;
}) {
  return [
    normalize(args.salonId || getSalonId()),
    normalize(args.date),
    normalize(args.serviceId),
    String(Math.max(1, Math.min(5, Number(args.peopleCount) || 1))),
    normalize(args.preferredCollaboratorId),
    args.ignoreMinAdvance ? "admin" : "standard",
  ].join("__");
}

export function readSlotsResultCache(cacheKey: string) {
  cleanup(slotsResultCache);
  const entry = slotsResultCache.get(cacheKey);
  if (!entry || entry.expiresAt <= now()) {
    slotsResultCache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

export function writeSlotsResultCache(cacheKey: string, value: SlotCacheValue) {
  slotsResultCache.set(cacheKey, { value, expiresAt: now() + SLOT_RESULT_CACHE_TTL_MS });
}

export function readInflightSlotsRequest(cacheKey: string) {
  return inflightSlotsRequests.get(cacheKey) || null;
}

export function writeInflightSlotsRequest(cacheKey: string, value: Promise<SlotCacheValue>) {
  inflightSlotsRequests.set(cacheKey, value);
}

export function clearInflightSlotsRequest(cacheKey: string) {
  inflightSlotsRequests.delete(cacheKey);
}

function buildBusyCacheKey(collaboratorId: string, dateISO: string, salonId?: string) {
  return `${normalize(salonId || getSalonId())}__${normalize(collaboratorId)}__${String(dateISO || "").trim()}`;
}

export function readBusyEventsDayCache(collaboratorId: string, dateISO: string, salonId?: string) {
  cleanup(busyEventsDayCache);
  const key = buildBusyCacheKey(collaboratorId, dateISO, salonId);
  const entry = busyEventsDayCache.get(key);
  if (!entry || entry.expiresAt <= now()) {
    busyEventsDayCache.delete(key);
    return null;
  }
  return entry.value;
}

export function writeBusyEventsDayCache(collaboratorId: string, dateISO: string, value: any[], salonId?: string) {
  busyEventsDayCache.set(buildBusyCacheKey(collaboratorId, dateISO, salonId), {
    value,
    expiresAt: now() + BUSY_EVENTS_CACHE_TTL_MS,
  });
}

export function invalidateSlotCaches(args?: {
  salonId?: string;
  date?: string | null;
  collaboratorIds?: Array<string | null | undefined>;
}) {
  const salonId = normalize(args?.salonId || getSalonId());
  const date = String(args?.date || "").trim();
  const collaboratorIds = (args?.collaboratorIds || []).map(normalize).filter(Boolean);

  for (const key of [...slotsResultCache.keys()]) {
    if (!key.startsWith(`${salonId}__`)) continue;
    if (date && !key.includes(`__${date}__`)) continue;
    slotsResultCache.delete(key);
    inflightSlotsRequests.delete(key);
  }

  for (const key of [...busyEventsDayCache.keys()]) {
    if (!key.startsWith(`${salonId}__`)) continue;
    if (date && !key.includes(`__${date}`)) continue;
    if (collaboratorIds.length && !collaboratorIds.some((id) => key.includes(`__${id}__`))) continue;
    busyEventsDayCache.delete(key);
  }

  void invalidatePersistentSlotsCache({ salonId, date }).catch((error) => {
    console.warn("daily_slot_cache invalidate background failed", error);
  });
}

export function invalidateAllSalonSlotCaches(salonId?: string) {
  invalidateSlotCaches({ salonId });
}
