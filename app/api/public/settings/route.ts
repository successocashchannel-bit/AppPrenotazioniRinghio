export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readBusinessSettings, serializeBusinessSettings } from "@/lib/business-settings";

export async function GET() {
  try {
    const settings = await readBusinessSettings();
    return NextResponse.json({
      ok: true,
      settings: {
        ...serializeBusinessSettings(settings),
        brandTitle: "Prenotazioni Online",
        brandSubtitle: "Prenota il tuo appuntamento in pochi secondi",
        logoUrl: "",
        icon192: "/icons/icon-192.png",
        icon512: "/icons/icon-512.png",
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Errore lettura impostazioni pubbliche",
      },
      { status: 500 }
    );
  }
}
