import { DateTime } from "luxon";
import {
  readBusinessSettings,
  generateCandidateSlots,
  fitsInsideWorkingWindows,
  isAtLeastMinutesAhead,
  TIME_ZONE,
  addMinutesToHHMM,
  toMinutes,
} from "@/lib/business-settings";
import { getServiceById } from "@/lib/services";
import {
  getCollaboratorById,
  readCollaboratorsList,
  type CollaboratorItem,
  collaboratorFitsWorkingWindows,
} from "@/lib/collaborators";
import {
  getCollaboratorCalendarId,
  listCollaboratorBusyEventsForDay,
  overlapsISO,
} from "@/lib/collaborator-calendar";
import { createAppointmentRecord } from "@/lib/appointments-db";
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

const DEFAULT_CALENDAR_ID =
  process.env.GOOGLE_CALENDAR_ID || process.env.CALENDAR_ID || "primary";

type InflightSlotsEntry = Promise<{
  settings: Awaited<ReturnType<typeof readBusinessSettings>>;
  slots: AvailableSlot[];
}>;

export type AvailableSlot = {
  time: string;
  collaboratorIds: string[];
  collaborators: Array<{ id: string; name: string }>;
};

export type PlannedBooking = {
  time: string;
  collaborator: CollaboratorItem;
  startISO: string;
  endISO: string;
};

type AvailabilityContext = {
  serviceId: string;
  serviceDuration: number;
  settings: Awaited<ReturnType<typeof readBusinessSettings>>;
  collaborators: CollaboratorItem[];
  date: string;
  slots: string[];
  ignoreMinAdvance: boolean;
  availabilityCache: Map<string, CollaboratorItem[]>;
  busyDayCache: Map<
    string,
    Awaited<ReturnType<typeof listCollaboratorBusyEventsForDay>>
  >;
};

function normalizeId(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function buildSlotInterval(date: string, time: string, durationMin: number) {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: TIME_ZONE });
  if (!start.isValid) {
    throw new Error("Data o orario non valido");
  }

  const end = start.plus({ minutes: durationMin });

  return {
    start,
    end,
    startISO: start.toISO()!,
    endISO: end.toISO()!,
  };
}

function collaboratorCanWork(
  collaborator: CollaboratorItem,
  date: string,
  time: string,
  durationMin: number
) {
  return (
    collaborator.active &&
    collaboratorFitsWorkingWindows(collaborator, date, time, durationMin)
  );
}

function uniqueCollaborators(items: CollaboratorItem[]) {
  const map = new Map<string, CollaboratorItem>();

  for (const item of items) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

function compareTime(a: string, b: string) {
  return toMinutes(a) - toMinutes(b);
}

async function preloadBusyEventsForContext(ctx: AvailabilityContext) {
  await Promise.all(
    ctx.collaborators.map(async (collaborator) => {
      const cacheKey = `${collaborator.id}__${ctx.date}`;
      if (ctx.busyDayCache.has(cacheKey)) return;

      const events = await listCollaboratorBusyEventsForDay(
        collaborator.id,
        ctx.date
      );

      ctx.busyDayCache.set(cacheKey, events);
    })
  );
}

async function createAvailabilityContext(args: {
  date: string;
  serviceId: string;
  fromTime?: string;
  ignoreMinAdvance?: boolean;
}): Promise<AvailabilityContext> {
  const serviceId = normalizeId(args.serviceId);

  const [service, settings, collaborators] = await Promise.all([
    getServiceById(serviceId),
    readBusinessSettings(),
    readCollaboratorsList(false),
  ]);

  if (!service || !service.active) {
    throw new Error(`Servizio non valido: ${args.serviceId}`);
  }

  if (!collaborators.length) {
    throw new Error("Nessun collaboratore attivo disponibile");
  }

  const slots = generateCandidateSlots(args.date, service.durationMin, settings, {
    ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
  })
    .filter((time) =>
      args.fromTime ? compareTime(time, args.fromTime) >= 0 : true
    )
    .sort(compareTime);

  const ctx: AvailabilityContext = {
    serviceId,
    serviceDuration: service.durationMin,
    settings,
    collaborators,
    date: args.date,
    slots,
    ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
    availabilityCache: new Map<string, CollaboratorItem[]>(),
    busyDayCache: new Map<
      string,
      Awaited<ReturnType<typeof listCollaboratorBusyEventsForDay>>
    >(),
  };

  await preloadBusyEventsForContext(ctx);

  return ctx;
}

async function collaboratorIsFreeFromContext(
  ctx: AvailabilityContext,
  collaborator: CollaboratorItem,
  startISO: string,
  endISO: string
) {
  const cacheKey = `${collaborator.id}__${ctx.date}`;

  if (!ctx.busyDayCache.has(cacheKey)) {
    const events = await listCollaboratorBusyEventsForDay(
      collaborator.id,
      ctx.date
    );
    ctx.busyDayCache.set(cacheKey, events);
  }

  const busy = ctx.busyDayCache.get(cacheKey) || [];

  return !busy.some((item) =>
    overlapsISO(startISO, endISO, item.startISO, item.endISO)
  );
}

async function getAvailableCollaboratorsFromContext(
  ctx: AvailabilityContext,
  time: string,
  preferredCollaboratorId?: string | null
) {
  const normalizedPreferred = normalizeId(preferredCollaboratorId);
  const cacheKey = `${time}__${normalizedPreferred || "all"}`;

  const cached = ctx.availabilityCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (
    !fitsInsideWorkingWindows(
      ctx.date,
      time,
      ctx.serviceDuration,
      ctx.settings
    )
  ) {
    ctx.availabilityCache.set(cacheKey, []);
    return [];
  }

  if (!ctx.ignoreMinAdvance && !isAtLeastMinutesAhead(ctx.date, time, ctx.settings.minAdvanceMin)) {
    ctx.availabilityCache.set(cacheKey, []);
    return [];
  }

  const { startISO, endISO } = buildSlotInterval(
    ctx.date,
    time,
    ctx.serviceDuration
  );

  const orderedCollaborators = normalizedPreferred
    ? [
        ...ctx.collaborators.filter((item) => item.id === normalizedPreferred),
        ...ctx.collaborators.filter((item) => item.id !== normalizedPreferred),
      ]
    : ctx.collaborators;

  const availability = await Promise.all(
    orderedCollaborators.map(async (collaborator) => {
      if (
        !collaboratorCanWork(
          collaborator,
          ctx.date,
          time,
          ctx.serviceDuration
        )
      ) {
        return null;
      }

      const free = await collaboratorIsFreeFromContext(
        ctx,
        collaborator,
        startISO,
        endISO
      );

      return free ? collaborator : null;
    })
  );

  const result = availability.filter(Boolean) as CollaboratorItem[];
  ctx.availabilityCache.set(cacheKey, result);
  return result;
}

export async function getAvailableCollaboratorsForSlot(args: {
  date: string;
  time: string;
  serviceId: string;
  preferredCollaboratorId?: string | null;
}) {
  const ctx = await createAvailabilityContext({
    date: args.date,
    serviceId: args.serviceId,
    fromTime: args.time,
  });

  return getAvailableCollaboratorsFromContext(
    ctx,
    args.time,
    args.preferredCollaboratorId
  );
}

async function buildSingleCollaboratorSequentialPlan(args: {
  date: string;
  serviceId: string;
  peopleCount: number;
  preferredCollaboratorId: string;
  startTime: string;
  ignoreMinAdvance?: boolean;
  ctx?: AvailabilityContext;
}) {
  const ctx =
    args.ctx ||
    (await createAvailabilityContext({
      date: args.date,
      serviceId: args.serviceId,
      fromTime: args.startTime,
      ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
    }));

  const collaborator = await getCollaboratorById(args.preferredCollaboratorId);

  if (!collaborator || !collaborator.active) {
    return null;
  }

  if (!ctx.slots.includes(args.startTime)) {
    return null;
  }

  const plan: PlannedBooking[] = [];
  let currentTime = args.startTime;

  for (let index = 0; index < args.peopleCount; index += 1) {
    if (!ctx.slots.includes(currentTime)) {
      return null;
    }

    const available = await getAvailableCollaboratorsFromContext(
      ctx,
      currentTime,
      args.preferredCollaboratorId
    );

    const found = available.find((item) => item.id === collaborator.id);
    if (!found) {
      return null;
    }

    const { startISO, endISO } = buildSlotInterval(
      args.date,
      currentTime,
      ctx.serviceDuration
    );

    plan.push({
      time: currentTime,
      collaborator: found,
      startISO,
      endISO,
    });

    currentTime = addMinutesToHHMM(currentTime, ctx.serviceDuration);
  }

  return { settings: ctx.settings, plan };
}

async function buildAutomaticPlan(args: {
  date: string;
  serviceId: string;
  peopleCount: number;
  startTime: string;
  ignoreMinAdvance?: boolean;
  ctx?: AvailabilityContext;
}) {
  const ctx =
    args.ctx ||
    (await createAvailabilityContext({
      date: args.date,
      serviceId: args.serviceId,
      fromTime: args.startTime,
      ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
    }));

  if (!ctx.slots.includes(args.startTime)) {
    return null;
  }

  const firstAvailable = uniqueCollaborators(
    await getAvailableCollaboratorsFromContext(ctx, args.startTime, null)
  );

  if (!firstAvailable.length) {
    return null;
  }

  const plan: PlannedBooking[] = [];
  const reserved = new Map<string, Array<{ startISO: string; endISO: string }>>();

  const firstInterval = buildSlotInterval(
    args.date,
    args.startTime,
    ctx.serviceDuration
  );

  const firstCollaborator = firstAvailable[0];

  plan.push({
    time: args.startTime,
    collaborator: firstCollaborator,
    startISO: firstInterval.startISO,
    endISO: firstInterval.endISO,
  });

  reserved.set(firstCollaborator.id, [
    {
      startISO: firstInterval.startISO,
      endISO: firstInterval.endISO,
    },
  ]);

  if (plan.length >= args.peopleCount) {
    return { settings: ctx.settings, plan };
  }

  for (const time of ctx.slots) {
    if (compareTime(time, args.startTime) < 0) {
      continue;
    }

    const available = uniqueCollaborators(
      await getAvailableCollaboratorsFromContext(ctx, time, null)
    );

    if (!available.length) {
      continue;
    }

    const { startISO, endISO } = buildSlotInterval(
      args.date,
      time,
      ctx.serviceDuration
    );

    for (const collaborator of available) {
      const existing = reserved.get(collaborator.id) || [];
      const hasOverlap = existing.some((item) =>
        overlapsISO(startISO, endISO, item.startISO, item.endISO)
      );

      const isExactDuplicate =
        collaborator.id === firstCollaborator.id && time === args.startTime;

      if (hasOverlap || isExactDuplicate) {
        continue;
      }

      plan.push({
        time,
        collaborator,
        startISO,
        endISO,
      });

      reserved.set(collaborator.id, [
        ...existing,
        { startISO, endISO },
      ]);

      if (plan.length >= args.peopleCount) {
        plan.sort((a, b) => {
          const byTime = compareTime(a.time, b.time);
          if (byTime !== 0) {
            return byTime;
          }
          return a.collaborator.name.localeCompare(
            b.collaborator.name,
            "it"
          );
        });

        return { settings: ctx.settings, plan };
      }
    }
  }

  return null;
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
  const peopleCount = 1;
  const preferredCollaboratorId = normalizeId(args.preferredCollaboratorId);
  const ctx =
    args.ctx ||
    (await createAvailabilityContext({
      date: args.date,
      serviceId: args.serviceId,
      fromTime: args.startTime,
      ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
    }));

  if (peopleCount === 1) {
    const available = await getAvailableCollaboratorsFromContext(
      ctx,
      args.startTime,
      preferredCollaboratorId || null
    );

    const collaborator = preferredCollaboratorId
      ? available.find((item) => item.id === preferredCollaboratorId) || null
      : available[0] || null;

    if (!collaborator) {
      return null;
    }

    const { startISO, endISO } = buildSlotInterval(
      args.date,
      args.startTime,
      ctx.serviceDuration
    );

    return {
      settings: ctx.settings,
      plan: [
        {
          time: args.startTime,
          collaborator,
          startISO,
          endISO,
        },
      ] as PlannedBooking[],
    };
  }

  if (preferredCollaboratorId) {
    return buildSingleCollaboratorSequentialPlan({
      date: args.date,
      serviceId: args.serviceId,
      peopleCount,
      preferredCollaboratorId,
      startTime: args.startTime,
      ctx,
      ignoreMinAdvance: args.ignoreMinAdvance,
    });
  }

  return buildAutomaticPlan({
    date: args.date,
    serviceId: args.serviceId,
    peopleCount,
    startTime: args.startTime,
    ctx,
    ignoreMinAdvance: args.ignoreMinAdvance,
  });
}

export async function getAvailableGroupSlots(args: {
  date: string;
  serviceId: string;
  peopleCount?: number;
  preferredCollaboratorId?: string | null;
  ignoreMinAdvance?: boolean;
}) {
  const serviceId = normalizeId(args.serviceId);
  const peopleCount = 1;
  const preferredCollaboratorId = normalizeId(args.preferredCollaboratorId);

  const cacheKey = buildSlotsCacheKey({
    date: args.date,
    serviceId,
    peopleCount,
    preferredCollaboratorId,
    ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
  });

  const cached = readSlotsResultCache(cacheKey);
  if (cached) {
    return cached;
  }

  const persistentCached = await readPersistentSlotsResultCache(cacheKey);
  if (persistentCached) {
    writeSlotsResultCache(cacheKey, persistentCached);
    return persistentCached;
  }

  const inflight = readInflightSlotsRequest(cacheKey);
  if (inflight) {
    return inflight;
  }

  const requestPromise: InflightSlotsEntry = (async () => {
    const ctx = await createAvailabilityContext({
      date: args.date,
      serviceId,
      ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
    });

    const slots: AvailableSlot[] = [];

    for (const time of ctx.slots) {
      const planned = await buildGroupBookingPlan({
        date: args.date,
        startTime: time,
        serviceId,
        peopleCount,
        preferredCollaboratorId: preferredCollaboratorId || null,
        ctx,
        ignoreMinAdvance: args.ignoreMinAdvance,
      });

      if (!planned || planned.plan.length < peopleCount) {
        continue;
      }

      const collaborators = uniqueCollaborators(
        planned.plan.map((item) => item.collaborator)
      );

      slots.push({
        time,
        collaboratorIds: collaborators.map((item) => item.id),
        collaborators: collaborators.map((item) => ({
          id: item.id,
          name: item.name,
        })),
      });
    }

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

function getGoogleEventColorIdForCollaborator(collaborator: CollaboratorItem) {
  const raw = String(collaborator.color || "").trim().toLowerCase();

  const directMap: Record<string, string> = {
    lavender: "1",
    sage: "2",
    grape: "3",
    flamingo: "4",
    banana: "5",
    tangerine: "6",
    peacock: "7",
    graphite: "8",
    blueberry: "9",
    basil: "10",
    tomato: "11",
    purple: "3",
    violet: "3",
    pink: "4",
    yellow: "5",
    orange: "6",
    cyan: "7",
    gray: "8",
    grey: "8",
    blue: "9",
    green: "10",
    red: "11",
  };

  if (raw && directMap[raw]) {
    return directMap[raw];
  }

  const fallbackByCollaboratorId: Record<string, string> = {
    collaboratore_1: "9",
    collaboratore_2: "10",
    collaboratore_3: "11",
    collaboratore_4: "6",
    collaboratore_5: "3",
  };

  if (fallbackByCollaboratorId[collaborator.id]) {
    return fallbackByCollaboratorId[collaborator.id];
  }

  const palette = ["9", "10", "11", "6", "3", "7", "5", "8", "1", "2", "4"];
  const hash = Array.from(collaborator.id).reduce(
    (acc, ch) => acc + ch.charCodeAt(0),
    0
  );

  return palette[hash % palette.length];
}

export async function createSingleBooking(args: {
  name: string;
  phone: string;
  date: string;
  time: string;
  serviceId: string;
  collaboratorId: string;
  notes?: string;
  groupLabel?: string;
  recurrenceLabel?: string;
  recurringRuleId?: string;
  ignoreMinAdvance?: boolean;
  peopleCount?: number;
}) {
  const serviceId = normalizeId(args.serviceId);
  const collaboratorId = normalizeId(args.collaboratorId);

  const [service, collaborator, settings] = await Promise.all([
    getServiceById(serviceId),
    getCollaboratorById(collaboratorId),
    readBusinessSettings(),
  ]);

  if (!service || !service.active) {
    throw new Error(`Servizio non valido: ${args.serviceId}`);
  }

  if (!collaborator || !collaborator.active) {
    throw new Error(`Collaboratore non valido: ${args.collaboratorId}`);
  }

  if (
    !fitsInsideWorkingWindows(
      args.date,
      args.time,
      service.durationMin,
      settings
    )
  ) {
    throw new Error("Lo slot selezionato è fuori orario lavorativo del salone");
  }

  if (
    !collaboratorFitsWorkingWindows(
      collaborator,
      args.date,
      args.time,
      service.durationMin
    )
  ) {
    throw new Error(
      `Il collaboratore ${collaborator.name} non lavora in questo orario o è in ferie`
    );
  }

  if (!args.ignoreMinAdvance && !isAtLeastMinutesAhead(args.date, args.time, settings.minAdvanceMin)) {
    throw new Error(
      `La prenotazione deve essere effettuata con almeno ${settings.minAdvanceMin} minuti di anticipo`
    );
  }

  const ctx = await createAvailabilityContext({
    date: args.date,
    serviceId,
    fromTime: args.time,
    ignoreMinAdvance: Boolean((args as any).ignoreMinAdvance),
  });

  const { start, end, startISO, endISO } = buildSlotInterval(
    args.date,
    args.time,
    ctx.serviceDuration
  );

  const availableCollaborators = await getAvailableCollaboratorsFromContext(
    ctx,
    args.time,
    collaborator.id
  );

  if (!availableCollaborators.some((item) => item.id === collaborator.id)) {
    throw new Error(
      `Il collaboratore ${collaborator.name} non è disponibile in questo slot`
    );
  }

  const eventId = `db_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const calendarId = getCollaboratorCalendarId(collaborator) || collaborator.id;
  const peopleCount = Math.max(1, Math.min(5, Number(args.peopleCount || 1) || 1));

  await createAppointmentRecord({
    eventId,
    calendarId,
    customerName: String(args.name || "").trim(),
    phone: String(args.phone || "").trim(),
    serviceId: service.id,
    serviceName: service.name,
    collaboratorId: collaborator.id,
    collaboratorName: collaborator.name,
    notes: String(args.notes || "").trim(),
    price: service.price,
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

  invalidateSlotCaches({
    date: args.date,
    collaboratorIds: [collaborator.id],
  });

  return {
    eventId,
    calendarId,
    collaborator,
    service,
    startISO,
    endISO,
    startLabel: start.toFormat("HH:mm"),
    endLabel: end.toFormat("HH:mm"),
  };
}
