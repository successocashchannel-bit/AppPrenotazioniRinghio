export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { buildGroupBookingPlan, createSingleBooking } from "@/lib/booking-engine";
import { addMinutesToHHMM } from "@/lib/business-settings";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      phone,
      date,
      time,
      serviceId,
      notes,
      peopleCount,
      customerNames,
      adminBypassMinAdvance,
    } = body ?? {};

    if (!name || !phone || !date || !time || !serviceId) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

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
      ignoreMinAdvance: bypassMinAdvance,
    });

    if (!planned || planned.plan.length < 1) {
      return NextResponse.json(
        { error: "Non ci sono abbastanza slot disponibili per questa prenotazione di gruppo" },
        { status: 409 }
      );
    }

    const groupLabel =
      totalPeople > 1 ? `${attendeeNames.join(", ")} · ${totalPeople} persone` : "";

    const created: Array<{
      eventId: string;
      customerName: string;
      time: string;
    }> = [];

    let currentTime = planned.plan[0].time;

    for (let index = 0; index < totalPeople; index += 1) {
      const bookingName = attendeeNames[index] || `${String(name).trim()} (${index + 1})`;

      const booking = await createSingleBooking({
        name: bookingName,
        phone: String(phone).trim(),
        date: String(date),
        time: currentTime,
        serviceId: String(serviceId).trim().toLowerCase(),
        notes: String(notes || "").trim(),
        groupLabel,
        peopleCount: 1,
        ignoreMinAdvance: bypassMinAdvance,
      });

      created.push({
        eventId: booking.eventId,
        customerName: bookingName,
        time: currentTime,
      });

      currentTime = addMinutesToHHMM(currentTime, booking.service.durationMin);
    }

    return NextResponse.json({
      success: true,
      eventId: created[0]?.eventId || "",
      bookingIds: created.map((item) => item.eventId),
      bookings: created,
      peopleCount: totalPeople,
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
