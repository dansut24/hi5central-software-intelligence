import { NextResponse } from "next/server";

export function requireAdmin(request) {
  const expected = process.env.ADMIN_API_KEY;

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const provided =
    request.headers.get("x-admin-api-key") ||
    request.nextUrl?.searchParams?.get("admin_key");

  if (provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}