export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { buildGroupBookingPlan, createSingleBooking } from "@/lib/booking-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      phone,
      date,
      time,
      serviceId,
      collaboratorId,
      preferredCollaboratorId,
      notes,
      peopleCount,
      customerNames,
      adminBypassMinAdvance,
    } = body ?? {};

    if (!name || !phone || !date || !time || !serviceId) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const normalizedPreferredCollaboratorId = String(
      preferredCollaboratorId || collaboratorId || ""
    )
      .trim()
      .toLowerCase();

    const totalPeople = Math.max(1, Math.min(5, Number(peopleCount || 1) || 1));
    const bypassMinAdvance = Boolean(adminBypassMinAdvance);

    const namesFromList = Array.isArray(customerNames)
      ? customerNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const attendeeNames =
      totalPeople === 1
        ? [String(name).trim()]
        : Array.from(
            { length: totalPeople },
            (_, index) => namesFromList[index] || `${String(name).trim()} (${index + 1})`
          );

    const planned = await buildGroupBookingPlan({
      date: String(date),
      startTime: String(time),
      serviceId: String(serviceId).trim().toLowerCase(),
      peopleCount: totalPeople,
      preferredCollaboratorId: normalizedPreferredCollaboratorId || null,
      ignoreMinAdvance: bypassMinAdvance,
    });

    if (!planned || planned.plan.length < 1) {
      return NextResponse.json(
        {
          error:
            normalizedPreferredCollaboratorId
              ? "Non ci sono abbastanza slot consecutivi disponibili per il collaboratore selezionato"
              : "Non ci sono abbastanza slot disponibili per questa prenotazione di gruppo",
        },
        { status: 409 }
      );
    }

    const groupLabel =
      totalPeople > 1 ? `${attendeeNames.join(", ")} · ${totalPeople} persone` : "";

    const created: Array<{
      eventId: string;
      collaboratorId: string;
      collaboratorName: string;
      customerName: string;
      time: string;
    }> = [];

    const assignment = planned.plan[0];
    const bookingName = totalPeople > 1 ? attendeeNames.join(", ") : attendeeNames[0];

    const booking = await createSingleBooking({
      name: bookingName,
      phone: String(phone).trim(),
      date: String(date),
      time: assignment.time,
      serviceId: String(serviceId).trim().toLowerCase(),
      collaboratorId: assignment.collaborator.id,
      notes: String(notes || "").trim(),
      groupLabel,
      peopleCount: totalPeople,
      ignoreMinAdvance: bypassMinAdvance,
    });

    created.push({
      eventId: booking.eventId,
      collaboratorId: assignment.collaborator.id,
      collaboratorName: assignment.collaborator.name,
      customerName: bookingName,
      time: assignment.time,
    });

    return NextResponse.json({
      success: true,
      eventId: created[0]?.eventId || "",
      bookingIds: created.map((item) => item.eventId),
      bookings: created,
      peopleCount: totalPeople,
      preferredCollaboratorId: normalizedPreferredCollaboratorId,
    });
  } catch (error: any) {
    console.error("Booking error in /api/book:", {
      message: error?.message,
      stack: error?.stack,
      response: error?.response?.data,
    });

    return NextResponse.json(
      {
        error: error?.message || "Errore durante la prenotazione",
        details: error?.response?.data || error?.message || "Errore sconosciuto",
      },
      { status: 500 }
    );
  }
}