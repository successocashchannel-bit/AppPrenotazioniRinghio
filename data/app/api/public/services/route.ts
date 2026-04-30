export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readServicesList } from "@/lib/services";

export async function GET() {
  const services = await readServicesList(false);
  return NextResponse.json({ ok: true, services });
}
