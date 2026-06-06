import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { searchOfficialSoftware } from "@/lib/tavily";
import { searchWinget } from "@/lib/winget";

export const dynamic = "force-dynamic";

function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCandidate(query, candidate) {
  const q = normalise(query);

  const name = normalise(
    candidate.name ||
    candidate.title ||
    candidate.winget_id ||
    ""
  );

  let score = 0;

  if (name === q) score += 100;
  else if (name.includes(q)) score += 80;
  else if (q.includes(name)) score += 60;

  if (candidate.source === "vendor") score += 20;
  if (candidate.source === "winget") score += 10;

  return Math.min(score, 100);
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const query = String(body.query || "").trim();

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "query is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const candidates = [];

    //
    // Existing catalogue
    //
    const { data: existing } = await supabase
      .from("software_catalogue")
      .select("id,name,vendor,winget_id")
      .ilike("name", `%${query}%`)
      .limit(10);

    for (const item of existing || []) {
      candidates.push({
        source: "catalogue",
        confidence: 100,
        software_id: item.id,
        name: item.name,
        vendor: item.vendor,
        winget_id: item.winget_id,
      });
    }

    //
    // Winget
    //
    try {
      const winget = await searchWinget(query, 10);

      for (const item of winget || []) {
        candidates.push({
          source: "winget",
          confidence: scoreCandidate(query, item),
          name: item.name,
          vendor: item.vendor,
          winget_id: item.winget_id,
          latest_version: item.latest_version,
          installer_type: item.installer_type,
          download_url: item.download_url,
          homepage_url: item.homepage_url || null,
        });
      }
    } catch (error) {
      console.error("Winget search failed", error);
    }

    //
    // Vendor discovery (Tavily)
    //
    try {
      const vendorResults = await searchOfficialSoftware(query);

      for (const result of vendorResults.slice(0, 5)) {
        candidates.push({
          source: "vendor",
          confidence: 90,
          title: result.title,
          name: result.title,
          url: result.url,
          snippet: result.content,
        });
      }
    } catch (error) {
      console.error("Tavily search failed", error);
    }

    const ranked = candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      query,
      count: ranked.length,
      candidates: ranked,
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