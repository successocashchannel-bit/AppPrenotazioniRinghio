export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { requireAdmin } from "@/lib/admin-auth";
import { TIME_ZONE } from "@/lib/business-settings";
import { createSingleBooking } from "@/lib/booking-engine";
import { createRecurringRule, updateRecurringRuleMeta } from "@/lib/recurring-rules";
import { getSalonId } from "@/lib/salon";

export async function POST(req: Request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const {
      customerName,
      phone,
      serviceId,
      collaboratorId,
      startDate,
      time,
      notes,
      every,
      unit,
      occurrences,
      occurrenceMode,
    } = body ?? {};

    if (!customerName || !phone || !serviceId || !collaboratorId || !startDate || !time) {
      return NextResponse.json({ error: "Dati mancanti per la ricorrenza" }, { status: 400 });
    }

    const repeatEvery = Math.max(1, Math.min(365, Number(every) || 1));
    const repeatUnit = ["days", "weeks", "months"].includes(String(unit)) ? String(unit) : "weeks";
    const isForever = String(occurrenceMode || "count") === "forever";
    const explicitOccurrences = Math.max(1, Math.min(240, Number(occurrences) || 1));
    const totalOccurrences = isForever ? 240 : explicitOccurrences;
    const baseDate = DateTime.fromISO(String(startDate), { zone: TIME_ZONE });

    if (!baseDate.isValid) {
      return NextResponse.json({ error: "Data iniziale non valida" }, { status: 400 });
    }

    const created: any[] = [];
    const skipped: any[] = [];
    const recurrenceLabel = isForever
      ? `ogni ${repeatEvery} ${repeatUnit === "days" ? "giorni" : repeatUnit === "weeks" ? "settimane" : "mesi"} per sempre`
      : `ogni ${repeatEvery} ${repeatUnit === "days" ? "giorni" : repeatUnit === "weeks" ? "settimane" : "mesi"}`;

    const normalizedCustomerName = String(customerName).trim();
    const normalizedPhone = String(phone).trim();
    const normalizedServiceId = String(serviceId).trim().toLowerCase();
    const normalizedCollaboratorId = String(collaboratorId).trim().toLowerCase();
    const normalizedNotes = String(notes || "").trim();

    const recurringRule = await createRecurringRule({
      customerName: normalizedCustomerName,
      phone: normalizedPhone,
      serviceId: normalizedServiceId,
      collaboratorId: normalizedCollaboratorId,
      startDate: String(startDate),
      time: String(time),
      every: repeatEvery,
      unit: repeatUnit as "days" | "weeks" | "months",
      occurrences: isForever ? null : explicitOccurrences,
      notes: normalizedNotes,
      recurrenceLabel,
      createdEventIds: [],
    });
    const recurringRuleId = String(recurringRule?.id || "").trim();

    const targetCreatedCount = totalOccurrences;
    const maxAttempts = Math.max(targetCreatedCount * 12, 120);

    for (let attemptIndex = 0; attemptIndex < maxAttempts && created.length < targetCreatedCount; attemptIndex += 1) {
      const currentDate = baseDate.plus({ [repeatUnit]: repeatEvery * attemptIndex } as any).toISODate()!;
      try {
        const booking = await createSingleBooking({
          name: normalizedCustomerName,
          phone: normalizedPhone,
          date: currentDate,
          time: String(time),
          serviceId: normalizedServiceId,
          collaboratorId: normalizedCollaboratorId,
          notes: normalizedNotes,
          recurrenceLabel,
          recurringRuleId,
        });

        created.push({
          eventId: booking.eventId,
          date: currentDate,
          collaboratorName: booking.collaborator.name,
        });
      } catch (error: any) {
        skipped.push({
          date: currentDate,
          reason: error?.message || "Errore sconosciuto",
        });
      }
    }

    if (recurringRuleId) {
      const { supabaseAdmin } = await import("@/lib/supabase-admin");
      if (created.length > 0) {
        await updateRecurringRuleMeta(recurringRuleId, {
          createdEventIds: created.map((item) => String(item.eventId || "")),
          unit: repeatUnit as "days" | "weeks" | "months",
          every: repeatEvery,
        });
      } else {
        await supabaseAdmin.from("recurring_rules").delete().eq("salon_id", getSalonId()).eq("id", recurringRuleId);
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount: created.length,
      requestedCount: targetCreatedCount,
      skippedCount: skipped.length,
      partial: !isForever && created.length < targetCreatedCount,
      created,
      skipped,
      recurrenceLabel,
      occurrenceMode: isForever ? "forever" : "count",
    });
  } catch (error: any) {
    console.error("Recurring bookings POST error:", error);
    return NextResponse.json({ error: error?.message || "Errore creazione ricorrenza" }, { status: 500 });
  }
}
