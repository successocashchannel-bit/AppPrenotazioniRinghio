import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL("/gestionale", req.url);
  return NextResponse.redirect(url);
}
