import { NextResponse } from "next/server";
import { searchWinget } from "@/lib/winget";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const query = searchParams.get("q");
    const limit = Math.min(Number(searchParams.get("limit") || 10), 25);

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { ok: false, error: "Query must be at least 2 characters" },
        { status: 400 }
      );
    }

    const results = await searchWinget(query.trim(), limit);

    return NextResponse.json({
      ok: true,
      query,
      count: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}