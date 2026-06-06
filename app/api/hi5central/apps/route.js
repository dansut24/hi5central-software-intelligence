import { NextResponse } from "next/server";
import { listHi5CentralApps } from "@/lib/hi5central-apps";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "hi5central",
    count: listHi5CentralApps().length,
    results: listHi5CentralApps(),
  });
}