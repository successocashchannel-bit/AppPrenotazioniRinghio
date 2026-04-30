export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { ADMIN_PASSWORD, ADMIN_USERNAME, setAdminCookie } from "@/lib/admin-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body?.username || "");
    const password = String(body?.password || "");

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Credenziali non valide" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, username: ADMIN_USERNAME });
    return setAdminCookie(res);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Errore login" }, { status: 500 });
  }
}
