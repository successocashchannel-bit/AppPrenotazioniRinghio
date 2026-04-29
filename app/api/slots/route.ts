export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { getServiceById } from "@/lib/services";
import {
  fitsInsideWorkingWindows,
  generateCandidateSlots,
  isAtLeastMinutesAhead,
  isClosedDate,
  readBusinessSettings,
  TIME_ZONE,
} from "@/lib/business-settings";
import { listBookingsForDate } from "@/lib/bookings";

function overlaps(startA: DateTime, endA: DateTime, startB: DateTime, endB: DateTime) {
  return startA.toMillis() < endB.toMillis() && endA.toMillis() > startB.toMillis();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = String(searchParams.get("date") || "").trim();
    const rawServiceId = String(searchParams.get("serviceId") || "").trim();

    if (!date || !rawServiceId) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    const serviceId = rawServiceId.toLowerCase();
    const [service, settings] = await Promise.all([
      getServiceById(serviceId),
      readBusinessSettings(),
    ]);

    if (!service || !service.active) {
      return NextResponse.json({ error: `Servizio non valido: ${rawServiceId}` }, { status: 400 });
    }

    if (isClosedDate(date, settings)) {
      return NextResponse.json({ date, serviceId, slots: [], closed: true, googleOk: false, settings });
    }

    const dayBookings = await listBookingsForDate(date);
    const busy = dayBookings.map((booking) => ({
      start: DateTime.fromISO(booking.startISO, { zone: TIME_ZONE }),
      end: DateTime.fromISO(booking.endISO, { zone: TIME_ZONE }),
    }));

    const candidates = generateCandidateSlots(date, settings);

    const validSlots = candidates.filter((slot) => {
      const slotStart = DateTime.fromISO(`${date}T${slot}`, { zone: TIME_ZONE });
      const slotEnd = slotStart.plus({ minutes: service.durationMin });

      if (!slotStart.isValid || !slotEnd.isValid) return false;
      if (!isAtLeastMinutesAhead(slotStart.toISO()!, settings.minAdvanceMin)) return false;
      if (!fitsInsideWorkingWindows(date, slot, service.durationMin, settings)) return false;

      const hasOverlap = busy.some((event) => overlaps(slotStart, slotEnd, event.start, event.end));
      return !hasOverlap;
    });

    return NextResponse.json({ date, serviceId, slots: validSlots, googleOk: false, settings });
  } catch (error: any) {
    console.error("Slots error in /api/slots:", error);
    return NextResponse.json(
      {
        error: "Errore nel recupero slot",
        details: error?.message || "Errore sconosciuto",
        googleOk: false,
      },
      { status: 500 }
    );
  }
}
