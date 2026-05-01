import { DateTime } from "luxon";
import {
  appointmentToDashboardItem,
  deleteAppointmentRecord,
  deleteAppointmentsByRecurringRuleId,
  getAppointmentByEventId,
  listAppointmentsByRecurringRuleId,
  listAppointmentsInRange,
} from "@/lib/appointments-db";
import { deleteRecurringRule, getRecurringRuleByEventId, getRecurringRuleById } from "@/lib/recurring-rules";
import { invalidateSlotCaches } from "@/lib/slot-cache";

export const TIME_ZONE = "Europe/Rome";

export async function listBookings(fromISO: string, toISO: string) {
  const dbItems = await listAppointmentsInRange(fromISO, toISO);
  return dbItems.map(appointmentToDashboardItem);
}

export async function deleteBooking(
  eventId: string,
  _calendarId?: string,
  scope: "single" | "series" = "single"
) {
  if (scope === "series") {
    const appointment = await getAppointmentByEventId(eventId);

    let recurringRuleId = String(appointment?.recurringRuleId || "").trim();
    let recurringRule: any = null;

    if (recurringRuleId) {
      recurringRule = await getRecurringRuleById(recurringRuleId);
    }

    if (!recurringRule) {
      recurringRule = await getRecurringRuleByEventId(eventId);
      recurringRuleId = String(recurringRule?.id || recurringRuleId || "").trim();
    }

    if (recurringRuleId) {
      const linkedAppointments = await listAppointmentsByRecurringRuleId(recurringRuleId);
      if (linkedAppointments.length) {
        await deleteAppointmentsByRecurringRuleId(recurringRuleId);
      }

      const createdEventIds = Array.isArray(recurringRule?.created_event_ids)
        ? recurringRule.created_event_ids.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];

      const extraEventIds = createdEventIds.filter(
        (linkedEventId: string) => !linkedAppointments.some((item) => item.eventId === linkedEventId)
      );

      for (const linkedEventId of extraEventIds) {
        await deleteAppointmentRecord(linkedEventId);
      }

      await deleteRecurringRule(recurringRuleId);
      const affected = linkedAppointments.map((item) => item.collaboratorId).filter(Boolean);
      const affectedDate = linkedAppointments[0]?.date || null;
      invalidateSlotCaches({ date: affectedDate, collaboratorIds: affected });
      return { ok: true, deletedScope: "series" };
    }
  }

  const appointment = await getAppointmentByEventId(eventId);
  await deleteAppointmentRecord(eventId);
  invalidateSlotCaches({
    date: appointment?.date || null,
    collaboratorIds: [appointment?.collaboratorId || ""],
  });
  return { ok: true, deletedScope: "single" };
}
