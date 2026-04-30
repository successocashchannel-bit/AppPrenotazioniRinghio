export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { clearAdminCookie } from "@/lib/admin-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  return clearAdminCookie(res);
}
