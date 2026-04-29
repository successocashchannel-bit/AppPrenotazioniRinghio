import { DateTime } from "luxon";
import {
  TIME_ZONE,
  fitsInsideWorkingWindows,
  isClosedDate,
  readBusinessSettings,
} from "@/lib/business-settings";
import { createBooking, listBookings, listBookingsForDate, markBookingCancelled, cancelRecurringSeries, updateRecurringSeriesNotes } from "@/lib/bookings";
import { getServiceById } from "@/lib/services";

export { TIME_ZONE, listBookings };

function overlaps(startA: DateTime, endA: DateTime, startB: DateTime, endB: DateTime) {
  return startA.toMillis() < endB.toMillis() && endA.toMillis() > startB.toMillis();
}

export async function createAdminBooking(input: {
  name: string;
  phone: string;
  date: string;
  time: string;
  serviceId: string;
  notes?: string;
  recurringSeriesId?: string;
  recurrenceLabel?: string;
}) {
  if (!input.name || !input.phone || !input.date || !input.time || !input.serviceId) {
    throw new Error("Compila nome, telefono, data, orario e servizio");
  }

  const normalizedServiceId = String(input.serviceId).trim().toLowerCase();
  const service = await getServiceById(normalizedServiceId);

  if (!service || !service.active) {
    throw new Error(`Servizio non valido: ${input.serviceId}`);
  }

  const settings = await readBusinessSettings();

  if (isClosedDate(input.date, settings)) {
    throw new Error("Il salone è chiuso nella data selezionata");
  }

  const start = DateTime.fromISO(`${input.date}T${input.time}`, { zone: TIME_ZONE });
  const end = start.plus({ minutes: service.durationMin });

  if (!start.isValid || !end.isValid) {
    throw new Error("Data o orario non validi");
  }

  if (!fitsInsideWorkingWindows(input.date, input.time, service.durationMin, settings)) {
    throw new Error("L'orario scelto è fuori dagli orari di apertura configurati");
  }

  const dayBookings = await listBookingsForDate(input.date);
  const hasDbOverlap = dayBookings.some((booking) => {
    const bookingStart = DateTime.fromISO(booking.startISO, { zone: TIME_ZONE });
    const bookingEnd = DateTime.fromISO(booking.endISO, { zone: TIME_ZONE });
    return overlaps(start, end, bookingStart, bookingEnd);
  });

  if (hasDbOverlap) {
    throw new Error("Questo orario non è più disponibile");
  }

  return await createBooking({
    name: input.name,
    phone: input.phone,
    date: input.date,
    time: input.time,
    serviceId: normalizedServiceId,
    notes: input.notes,
    recurringSeriesId: input.recurringSeriesId,
    recurrenceLabel: input.recurrenceLabel,
  });
}

export async function deleteBooking(eventId: string) {
  return await markBookingCancelled(eventId);
}

export async function createRecurringAdminBookings(input: {
  name: string;
  phone: string;
  date: string;
  time: string;
  serviceId: string;
  notes?: string;
  every: number;
  unit: "days" | "weeks" | "months";
  occurrences: number;
}) {
  const every = Math.max(1, Number(input.every) || 1);
  const occurrences = Math.max(1, Math.min(52, Number(input.occurrences) || 1));
  const seriesId = crypto.randomUUID();
  const recurrenceLabel = `Ogni ${every} ${input.unit === "days" ? "giorno/i" : input.unit === "weeks" ? "settimana/e" : "mese/i"} · ${occurrences} appuntamenti`;
  const created: Awaited<ReturnType<typeof createAdminBooking>>[] = [];
  const skipped: Array<{ date: string; reason: string }> = [];

  let current = DateTime.fromISO(input.date, { zone: TIME_ZONE });
  if (!current.isValid) {
    throw new Error("Data ricorrenza non valida");
  }

  for (let index = 0; index < occurrences; index += 1) {
    const currentDate = current.toISODate() || input.date;

    try {
      const booking = await createAdminBooking({
        name: input.name,
        phone: input.phone,
        date: currentDate,
        time: input.time,
        serviceId: input.serviceId,
        notes: input.notes,
        recurringSeriesId: seriesId,
        recurrenceLabel,
      });
      created.push(booking);
    } catch (error: any) {
      skipped.push({
        date: currentDate,
        reason: error?.message || "Slot non disponibile",
      });
    }

    if (input.unit === "days") {
      current = current.plus({ days: every });
    } else if (input.unit === "weeks") {
      current = current.plus({ weeks: every });
    } else {
      current = current.plus({ months: every });
    }
  }

  return {
    created,
    skipped,
    createdCount: created.length,
    skippedCount: skipped.length,
    seriesId,
    recurrenceLabel,
  };
}

export async function deleteRecurringSeries(seriesId: string) {
  return await cancelRecurringSeries(seriesId);
}

export async function editRecurringSeriesNotes(seriesId: string, notes: string) {
  return await updateRecurringSeriesNotes(seriesId, notes);
}
