export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { getServiceById } from "@/lib/services";
import { getCollaboratorById } from "@/lib/collaborators";
import {
  readBusinessSettings,
  isClosedDate,
  serializeBusinessSettings,
} from "@/lib/business-settings";
import { getAvailableGroupSlots } from "@/lib/booking-engine";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const date = String(searchParams.get("date") || "").trim();
    const rawServiceId = String(searchParams.get("serviceId") || "").trim();
    const rawCollaboratorId = String(searchParams.get("collaboratorId") || "").trim();
    const rawPreferredCollaboratorId = String(
      searchParams.get("preferredCollaboratorId") || ""
    ).trim();
    const adminBypassMinAdvance = ["1", "true", "yes"].includes(
      String(searchParams.get("adminBypassMinAdvance") || "").trim().toLowerCase()
    );

    const peopleCount = Math.max(
      1,
      Math.min(5, Number(searchParams.get("peopleCount") || 1) || 1)
    );

    if (!date || !rawServiceId) {
      return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 });
    }

    const serviceId = rawServiceId.toLowerCase();
    const collaboratorId = rawCollaboratorId.toLowerCase();
    const preferredCollaboratorId = String(
      rawPreferredCollaboratorId || collaboratorId || ""
    )
      .trim()
      .toLowerCase();

    const [service, settings, collaborator] = await Promise.all([
      getServiceById(serviceId),
      readBusinessSettings(),
      collaboratorId ? getCollaboratorById(collaboratorId) : Promise.resolve(null),
    ]);

    if (!service || !service.active) {
      return NextResponse.json(
        { error: `Servizio non valido: ${rawServiceId}` },
        { status: 400 }
      );
    }

    if (collaboratorId && (!collaborator || !collaborator.active)) {
      return NextResponse.json(
        { error: `Collaboratore non valido: ${rawCollaboratorId}` },
        { status: 400 }
      );
    }

    if (isClosedDate(date, settings)) {
      return NextResponse.json({
        date,
        serviceId,
        collaboratorId,
        preferredCollaboratorId,
        peopleCount,
        slots: [],
        slotsDetailed: [],
        closed: true,
        googleOk: true,
        settings: serializeBusinessSettings(settings),
      });
    }

    const result = await getAvailableGroupSlots({
      date,
      serviceId,
      peopleCount,
      preferredCollaboratorId: preferredCollaboratorId || null,
      ignoreMinAdvance: adminBypassMinAdvance,
    });

    return NextResponse.json({
      date,
      serviceId,
      collaboratorId,
      preferredCollaboratorId,
      peopleCount,
      slots: result.slots.map((slot) => slot.time),
      slotsDetailed: result.slots,
      googleOk: true,
      settings: serializeBusinessSettings(result.settings),
    });
  } catch (error: any) {
    console.error("Collaborator slots error in /api/slots:", {
      message: error?.message,
      stack: error?.stack,
      response: error?.response?.data,
    });

    return NextResponse.json(
      {
        error: error?.message || "Errore nel recupero slot",
        details: error?.response?.data || error?.message || "Errore sconosciuto",
        googleOk: false,
      },
      { status: 500 }
    );
  }
}