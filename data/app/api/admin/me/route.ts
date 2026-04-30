export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { isAdminAuthenticated, ADMIN_USERNAME } from "@/lib/admin-auth";

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ ok: true, authenticated, username: authenticated ? ADMIN_USERNAME : null });
}
