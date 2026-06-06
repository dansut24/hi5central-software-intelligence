import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = String(text || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.trim().toLowerCase()
  );

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);

    const row = {
      row_number: index + 2,
    };

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || "";
    });

    return row;
  });
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key]) return row[key];
  }

  return "";
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const clearExisting = formData.get("clearExisting") === "true";

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "CSV file is required" },
        { status: 400 }
      );
    }

    const csvText = await file.text();
    const rows = parseCsv(csvText);

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "CSV contains no data rows" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    if (clearExisting) {
      await supabase
        .from("software_research_queue")
        .delete()
        .neq("status", "imported");
    }

    const records = rows
      .map((row) => {
        const name = pick(row, ["name", "software_name", "app_name"]);
        const vendor = pick(row, ["vendor", "publisher"]);
        const category = pick(row, ["category", "group"]);

        return {
          name,
          vendor: vendor || null,
          category: category || "Uncategorised",
          homepage_url: pick(row, ["homepage_url", "homepage", "website"]) || null,
          release_url:
            pick(row, ["release_url", "release_notes_url", "releases_url"]) ||
            null,
          download_url:
            pick(row, ["download_url", "installer_url", "url"]) || null,
          installer_type: pick(row, ["installer_type", "type"]) || null,
          silent_install_args:
            pick(row, ["silent_install_args", "silent_install", "install_args"]) ||
            null,
          silent_uninstall_args:
            pick(row, [
              "silent_uninstall_args",
              "silent_uninstall",
              "uninstall_args",
            ]) || null,
          detection_method:
            pick(row, ["detection_method", "detection_type"]) || null,
          detection_value:
            pick(row, ["detection_value", "detection_path", "detection"]) || null,
          status: "pending",
          notes: pick(row, ["notes", "status", "curation_status"]) || null,
          raw: row,
          updated_at: new Date().toISOString(),
        };
      })
      .filter((record) => record.name);

    if (!records.length) {
      return NextResponse.json(
        { ok: false, error: "No valid rows found. A name column is required." },
        { status: 400 }
      );
    }

    const batchSize = 500;
    const inserted = [];
    const errors = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      const { data, error } = await supabase
        .from("software_research_queue")
        .insert(batch)
        .select("id,name,vendor,category,status");

      if (error) {
        errors.push({
          batch_start: i + 1,
          batch_end: i + batch.length,
          error: error.message,
        });
      } else {
        inserted.push(...(data || []));
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      filename: file.name,
      total_rows: rows.length,
      valid_rows: records.length,
      inserted_count: inserted.length,
      failed_batches: errors.length,
      errors,
      preview: inserted.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}