export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readBusinessSettings } from "@/lib/business-settings";

export async function GET() {
  try {
    const settings = await readBusinessSettings();
    return NextResponse.json(
      { ok: true, settings },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore lettura impostazioni pubbliche" }, { status: 500 });
  }
}
