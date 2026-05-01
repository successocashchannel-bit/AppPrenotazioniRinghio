export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readCollaboratorsList, serializeCollaborator } from "@/lib/collaborators";

export async function GET() {
  try {
    const collaborators = await readCollaboratorsList(false);

    return NextResponse.json({
      ok: true,
      collaborators: collaborators.map(serializeCollaborator),
    });
  } catch (error: any) {
    console.error("Public collaborators error:", {
      message: error?.message,
      stack: error?.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Errore caricamento collaboratori",
      },
      { status: 500 }
    );
  }
}