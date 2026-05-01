import { DateTime } from "luxon";
import {
  readBusinessSettings,
  generateCandidateSlots,
  fitsInsideWorkingWindows,
  isAtLeastMinutesAhead,
  TIME_ZONE,
} from "@/lib/business-settings";
import { getServiceById, type ServiceItem } from "@/lib/services";
import {
  createAppointmentRecord,
  listAppointmentsInRange,
  type AppointmentRecord,
} from "@/lib/appointments-db";
import { overlapsISO } from "@/lib/collaborator-calendar";
import {
  buildSlotsCacheKey,
  readSlotsResultCache,
  writeSlotsResultCache,
  readPersistentSlotsResultCache,
  writePersistentSlotsResultCache,
  readInflightSlotsRequest,
  writeInflightSlotsRequest,
  clearInflightSlotsRequest,
  invalidateSlotCaches,
} from "@/lib/slot-cache";

const SINGLE_OPERATOR = { id: "", name: "Operatore", active: true };

type Settings = Awaited<ReturnType<typeof readBusinessSettings>>;

type InflightSlotsEntry = Promise<{
  settings: Settings;
  slots: AvailableSlot[];
}>;

export type AvailableSlot = {
  time: string;
  collaboratorIds: string[];
  collaborators: Array<{ id: string; name: string }>;
};

export type PlannedBooking = {
  time: string;
  collaborator: typeof SINGLE_OPERATOR;
  startISO: string;
  endISO: string;
};

type AvailabilityContext = {
  serviceId: string;
  service: ServiceItem;
  serviceDuration: number;
  settings: Settings;
  date: string;
  slots: string[];
  ignoreMinAdvance: boolean;
  busy: AppointmentRecord[];
};

function normalizeId(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function buildSlotInterval(date: string, time: string, durationMin: number) {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: TIME_ZONE });
  if (!start.isValid) throw new Error("Data o orario non valido");
  const end = start.plus({ minutes: durationMin });
  return { start, end, startISO: start.toISO()!, endISO: end.toISO()! };
}

function dayBounds(date: string) {
  const start = DateTime.fromISO(date, { zone: TIME_ZONE }).startOf("day");
  const end = start.plus({ days: 1 });
  return { startISO: start.toISO()!, endISO: end.toISO()! };
}

function compareTime(a: string, b: string) {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  return ah * 60 + am - (bh * 60 + bm);
}

async function createAvailabilityContext(args: {
  date: string;
  serviceId: string;
  fromTime?: string;
  ignoreMinAdvance?: boolean;
}): Promise<AvailabilityContext> {
  const serviceId = normalizeId(args.serviceId);
  const [service, settings] = await Promise.all([getServiceById(serviceId), readBusinessSettings()]);

  if (!service || !service.active) throw new Error(`Servizio non valido: ${args.serviceId}`);

  const slots = generateCandidateSlots(args.date, service.durationMin, settings, {
    ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
  })
    .filter((time) => (args.fromTime ? compareTime(time, args.fromTime) >= 0 : true))
    .sort(compareTime);

  const bounds = dayBounds(args.date);
  const busy = await listAppointmentsInRange(bounds.startISO, bounds.endISO);

  return {
    serviceId,
    service,
    serviceDuration: service.durationMin,
    settings,
    date: args.date,
    slots,
    ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
    busy: busy.filter((item) => item.status !== "cancelled"),
  };
}

function isSlotFree(ctx: AvailabilityContext, time: string, durationMin: number) {
  if (!ctx.slots.includes(time)) return false;
  if (!fitsInsideWorkingWindows(ctx.date, time, durationMin, ctx.settings)) return false;
  if (!ctx.ignoreMinAdvance && !isAtLeastMinutesAhead(ctx.date, time, ctx.settings.minAdvanceMin)) return false;

  const { startISO, endISO } = buildSlotInterval(ctx.date, time, durationMin);
  return !ctx.busy.some((item) => overlapsISO(startISO, endISO, item.startISO, item.endISO));
}

export async function getAvailableCollaboratorsForSlot(args: {
  date: string;
  time: string;
  serviceId: string;
  preferredCollaboratorId?: string | null;
}) {
  const ctx = await createAvailabilityContext({ date: args.date, serviceId: args.serviceId, fromTime: args.time });
  return isSlotFree(ctx, args.time, ctx.serviceDuration) ? [SINGLE_OPERATOR] : [];
}

export async function buildGroupBookingPlan(args: {
  date: string;
  startTime: string;
  serviceId: string;
  peopleCount?: number;
  preferredCollaboratorId?: string | null;
  ignoreMinAdvance?: boolean;
  ctx?: AvailabilityContext;
}) {
  const peopleCount = Math.max(1, Math.min(5, Number(args.peopleCount || 1) || 1));
  const ctx =
    args.ctx ||
    (await createAvailabilityContext({
      date: args.date,
      serviceId: args.serviceId,
      fromTime: args.startTime,
      ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
    }));

  const totalDurationMin = ctx.serviceDuration * peopleCount;
  if (!isSlotFree(ctx, args.startTime, totalDurationMin)) return null;

  const { startISO, endISO } = buildSlotInterval(ctx.date, args.startTime, totalDurationMin);
  return {
    settings: ctx.settings,
    plan: [{ time: args.startTime, collaborator: SINGLE_OPERATOR, startISO, endISO }] as PlannedBooking[],
  };
}

export async function getAvailableGroupSlots(args: {
  date: string;
  serviceId: string;
  peopleCount?: number;
  preferredCollaboratorId?: string | null;
  ignoreMinAdvance?: boolean;
}) {
  const serviceId = normalizeId(args.serviceId);
  const peopleCount = Math.max(1, Math.min(5, Number(args.peopleCount || 1) || 1));
  const cacheKey = buildSlotsCacheKey({
    date: args.date,
    serviceId,
    peopleCount,
    preferredCollaboratorId: "",
    ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
  });

  const cached = readSlotsResultCache(cacheKey);
  if (cached) return cached;

  const persistentCached = await readPersistentSlotsResultCache(cacheKey);
  if (persistentCached) {
    writeSlotsResultCache(cacheKey, persistentCached);
    return persistentCached;
  }

  const inflight = readInflightSlotsRequest(cacheKey);
  if (inflight) return inflight;

  const requestPromise: InflightSlotsEntry = (async () => {
    const ctx = await createAvailabilityContext({
      date: args.date,
      serviceId,
      ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
    });
    const totalDurationMin = ctx.serviceDuration * peopleCount;
    const slots: AvailableSlot[] = ctx.slots
      .filter((time) => isSlotFree(ctx, time, totalDurationMin))
      .map((time) => ({ time, collaboratorIds: [], collaborators: [] }));

    const result = { settings: ctx.settings, slots };
    writeSlotsResultCache(cacheKey, result);
    await writePersistentSlotsResultCache(cacheKey, result);
    return result;
  })();

  writeInflightSlotsRequest(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    clearInflightSlotsRequest(cacheKey);
  }
}

export async function createSingleBooking(args: {
  name: string;
  phone: string;
  date: string;
  time: string;
  serviceId: string;
  collaboratorId?: string;
  notes?: string;
  groupLabel?: string;
  recurrenceLabel?: string;
  recurringRuleId?: string;
  ignoreMinAdvance?: boolean;
  peopleCount?: number;
}) {
  const serviceId = normalizeId(args.serviceId);
  const [service, settings] = await Promise.all([getServiceById(serviceId), readBusinessSettings()]);

  if (!service || !service.active) throw new Error(`Servizio non valido: ${args.serviceId}`);

  const peopleCount = Math.max(1, Math.min(5, Number(args.peopleCount || 1) || 1));
  const totalDurationMin = service.durationMin * peopleCount;

  if (!fitsInsideWorkingWindows(args.date, args.time, totalDurationMin, settings)) {
    throw new Error("Lo slot selezionato è fuori orario lavorativo del salone");
  }

  if (!args.ignoreMinAdvance && !isAtLeastMinutesAhead(args.date, args.time, settings.minAdvanceMin)) {
    throw new Error(`La prenotazione deve essere effettuata con almeno ${settings.minAdvanceMin} minuti di anticipo`);
  }

  const ctx = await createAvailabilityContext({
    date: args.date,
    serviceId,
    fromTime: args.time,
    ignoreMinAdvance: Boolean(args.ignoreMinAdvance),
  });

  if (!isSlotFree(ctx, args.time, totalDurationMin)) throw new Error("Lo slot selezionato non è più disponibile");

  const { start, end, startISO, endISO } = buildSlotInterval(args.date, args.time, totalDurationMin);
  const eventId = `db_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  await createAppointmentRecord({
    eventId,
    calendarId: "primary",
    customerName: String(args.name || "").trim(),
    phone: String(args.phone || "").trim(),
    serviceId: service.id,
    serviceName: service.name,
    collaboratorId: "",
    collaboratorName: "",
    notes: String(args.notes || "").trim(),
    price: service.price * peopleCount,
    date: args.date,
    time: args.time,
    startISO,
    endISO,
    peopleCount,
    groupLabel: String(args.groupLabel || "").trim(),
    recurrenceLabel: String(args.recurrenceLabel || "").trim(),
    recurringRuleId: String(args.recurringRuleId || "").trim(),
    status: "confirmed",
  });

  invalidateSlotCaches({ date: args.date, collaboratorIds: [] });

  return {
    eventId,
    calendarId: "primary",
    collaborator: SINGLE_OPERATOR,
    service,
    startISO,
    endISO,
    startLabel: start.toFormat("HH:mm"),
    endLabel: end.toFormat("HH:mm"),
  };
}
