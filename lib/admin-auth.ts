import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "admin";
const COOKIE_NAME = "rb_admin_auth";
const COOKIE_VALUE = "ok";

export async function isAdminAuthenticated() {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value === COOKIE_VALUE;
}

export function setAdminCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Accesso admin richiesto" }, { status: 401 });
  }
  return null;
}
