import { DateTime } from "luxon";
import { TIME_ZONE } from "@/lib/business-settings";
import { getCollaboratorById, type CollaboratorItem } from "@/lib/collaborators";
import { listAppointmentsForCollaboratorInRange } from "@/lib/appointments-db";
import { readBusyEventsDayCache, writeBusyEventsDayCache } from "@/lib/slot-cache";

export type CalendarBooking = {
  id: string;
  summary: string;
  description: string;
  startISO: string;
  endISO: string;
  calendarId: string;
  collaboratorId: string;
};

export function getCalendarClient() {
  return null;
}

export function getCollaboratorCalendarId(
  collaborator: Pick<CollaboratorItem, "calendarId" | "id"> | null | undefined
) {
  return String(collaborator?.id || collaborator?.calendarId || "").trim().toLowerCase();
}

export function overlapsISO(
  startAISO: string,
  endAISO: string,
  startBISO: string,
  endBISO: string
) {
  const aStart = DateTime.fromISO(startAISO, { zone: TIME_ZONE });
  const aEnd = DateTime.fromISO(endAISO, { zone: TIME_ZONE });
  const bStart = DateTime.fromISO(startBISO, { zone: TIME_ZONE });
  const bEnd = DateTime.fromISO(endBISO, { zone: TIME_ZONE });

  if (!aStart.isValid || !aEnd.isValid || !bStart.isValid || !bEnd.isValid) return false;
  return aStart < bEnd && bStart < aEnd;
}

export async function listCollaboratorBusyEventsForDay(
  collaboratorId: string,
  dateISO: string
): Promise<CalendarBooking[]> {
  const normalizedId = String(collaboratorId || "").trim().toLowerCase();
  const normalizedDate = String(dateISO || "").trim();
  if (!normalizedId || !normalizedDate) return [];

  const cached = readBusyEventsDayCache(normalizedId, normalizedDate);
  if (cached) return cached;

  const collaborator = await getCollaboratorById(normalizedId);
  if (!collaborator || !collaborator.active) {
    writeBusyEventsDayCache(normalizedId, normalizedDate, []);
    return [];
  }

  const start = DateTime.fromISO(normalizedDate, { zone: TIME_ZONE }).startOf("day");
  const end = start.plus({ days: 1 });

  const appointments = await listAppointmentsForCollaboratorInRange(
    normalizedId,
    start.toISO()!,
    end.toISO()!
  );

  const items: CalendarBooking[] = appointments
    .filter((item) => item.status !== "cancelled")
    .map((item) => ({
      id: item.eventId,
      summary: `${item.serviceName} - ${item.customerName}`,
      description: item.notes || "",
      startISO: item.startISO,
      endISO: item.endISO,
      calendarId: item.calendarId || normalizedId,
      collaboratorId: normalizedId,
    }));

  writeBusyEventsDayCache(normalizedId, normalizedDate, items);
  return items;
}
