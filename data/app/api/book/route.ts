export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getServiceById } from "@/lib/services";
import {
  fitsInsideWorkingWindows,
  isAtLeastMinutesAhead,
  isClosedDate,
  readBusinessSettings,
  TIME_ZONE,
} from "@/lib/business-settings";
import { createBooking, listBookingsForDate } from "@/lib/bookings";

function overlaps(startA: DateTime, endA: DateTime, startB: DateTime, endB: DateTime) {
  return startA.toMillis() < endB.toMillis() && endA.toMillis() > startB.toMillis();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, date, time, serviceId, notes } = body ?? {};

    if (!name || !phone || !date || !time || !serviceId) {
      return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
    }

    const normalizedServiceId = String(serviceId).trim().toLowerCase();
    const service = await getServiceById(normalizedServiceId);

    if (!service || !service.active) {
      return NextResponse.json({ error: `Servizio non valido: ${serviceId}` }, { status: 400 });
    }

    const settings = await readBusinessSettings();

    if (isClosedDate(date, settings)) {
      return NextResponse.json({ error: "Il salone è chiuso in questa data" }, { status: 400 });
    }

    const start = DateTime.fromISO(`${date}T${time}`, { zone: TIME_ZONE });
    const end = start.plus({ minutes: service.durationMin });

    if (!start.isValid || !end.isValid) {
      return NextResponse.json({ error: "Data o orario non validi" }, { status: 400 });
    }

    if (!isAtLeastMinutesAhead(start.toISO()!, settings.minAdvanceMin)) {
      return NextResponse.json({ error: `Puoi prenotare solo almeno ${settings.minAdvanceMin} minuti prima` }, { status: 400 });
    }

    if (!fitsInsideWorkingWindows(date, time, service.durationMin, settings)) {
      return NextResponse.json({ error: "L'orario scelto è fuori dagli orari di apertura configurati" }, { status: 400 });
    }

    const dayBookings = await listBookingsForDate(date);
    const hasDbOverlap = dayBookings.some((booking) => {
      const bookingStart = DateTime.fromISO(booking.startISO, { zone: TIME_ZONE });
      const bookingEnd = DateTime.fromISO(booking.endISO, { zone: TIME_ZONE });
      return overlaps(start, end, bookingStart, bookingEnd);
    });

    if (hasDbOverlap) {
      return NextResponse.json({ error: "Questo orario non è più disponibile" }, { status: 409 });
    }

    const booking = await createBooking({
      name: String(name).trim(),
      phone: String(phone).trim(),
      date: String(date),
      time: String(time),
      serviceId: normalizedServiceId,
      notes: String(notes || "").trim(),
    });

    return NextResponse.json({ success: true, bookingId: booking.id, googleEventId: null });
  } catch (error: any) {
    console.error("Booking error in /api/book:", error);
    return NextResponse.json(
      {
        error: "Errore durante la prenotazione",
        details: error?.message || "Errore sconosciuto",
      },
      { status: 500 }
    );
  }
}
