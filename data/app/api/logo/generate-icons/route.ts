export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        { error: "Configura NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY su Vercel." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File mancante" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = ["png", "jpg", "jpeg", "webp", "svg"].includes(ext) ? ext : "png";
    const fileName = `logo-${Date.now()}.${safeExt}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(fileName, buffer, {
        upsert: true,
        contentType: file.type || "image/png",
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const logoUrl = supabase.storage.from("logos").getPublicUrl(fileName).data.publicUrl;

    return NextResponse.json({
      ok: true,
      logoUrl,
      icon192: logoUrl,
      icon512: logoUrl,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore upload logo" }, { status: 500 });
  }
}
