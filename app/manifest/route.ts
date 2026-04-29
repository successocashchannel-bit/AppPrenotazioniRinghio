export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readBusinessSettings } from "@/lib/business-settings";

export async function GET() {
  let title = "Prenotazioni Online";
  let subtitle = "Prenota il tuo appuntamento in pochi secondi";

  try {
    const settings = await readBusinessSettings();
    title = settings.brandTitle?.trim() || title;
    subtitle = settings.brandSubtitle?.trim() || subtitle;
  } catch {}

  return NextResponse.json(
    {
      name: title,
      short_name: title.slice(0, 12) || "Prenota",
      description: subtitle,
      start_url: "/",
      display: "standalone",
      background_color: "#0F0F0F",
      theme_color: "#0F0F0F",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png"
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png"
        }
      ]
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}
