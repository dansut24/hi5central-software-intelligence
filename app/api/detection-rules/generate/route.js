import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const KNOWN_RULES = {
  "Google.Chrome": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Google\\Chrome\\BLBeacon",
    registry_value: "version",
  },
  "Microsoft.Edge": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Microsoft\\Edge\\BLBeacon",
    registry_value: "version",
  },
  "Mozilla.Firefox": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Mozilla\\Mozilla Firefox",
    registry_value: "CurrentVersion",
  },
  "Microsoft.VisualStudioCode": {
    method: "registry",
    registry_hive: "HKCU",
    registry_path:
      "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1",
    registry_value: "DisplayVersion",
  },
  "OpenJS.NodeJS.LTS": {
    method: "command",
    version_command: "node --version",
  },
  "Git.Git": {
    method: "command",
    version_command: "git --version",
  },
  "Python.Python.3.13": {
    method: "command",
    version_command: "python --version",
  },
  "7zip.7zip": {
    method: "file",
    file_path: "C:\\Program Files\\7-Zip\\7z.exe",
  },
  "Notepad++.Notepad++": {
    method: "file",
    file_path: "C:\\Program Files\\Notepad++\\notepad++.exe",
  },
  "VideoLAN.VLC": {
    method: "file",
    file_path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
  },
  "PuTTY.PuTTY": {
    method: "file",
    file_path: "C:\\Program Files\\PuTTY\\putty.exe",
  },
};

function cleanAppName(name = "") {
  return String(name)
    .replace(/\(.*?\)/g, "")
    .replace(/desktop/gi, "")
    .replace(/app/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim();
}

function compactName(name = "") {
  return cleanAppName(name).replace(/\s+/g, "");
}

function guessExeName(software) {
  const wingetTail = String(software.winget_id || "")
    .split(".")
    .pop();

  const candidates = [
    compactName(software.name),
    compactName(wingetTail),
    cleanAppName(software.name).split(" ")[0],
  ].filter(Boolean);

  return `${candidates[0] || "app"}.exe`;
}

function generateFallbackRule(software) {
  const exeName = guessExeName(software);
  const folderName = compactName(software.name);

  return {
    method: "file",
    file_path: `C:\\Program Files\\${folderName}\\${exeName}`,
  };
}

function buildRule(software) {
  const known = KNOWN_RULES[software.winget_id];

  if (known) {
    return known;
  }

  return generateFallbackRule(software);
}

function normalizeRule(rule) {
  return {
    platform: "windows",
    method: rule.method,
    registry_hive: rule.registry_hive || null,
    registry_path: rule.registry_path || null,
    registry_value: rule.registry_value || null,
    file_path: rule.file_path || null,
    version_command: rule.version_command || null,
  };
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const softwareId = body.software_id;

    if (!softwareId) {
      return NextResponse.json(
        { ok: false, error: "software_id is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: software, error: softwareError } = await supabase
      .from("software_catalogue")
      .select("*")
      .eq("id", softwareId)
      .single();

    if (softwareError || !software) {
      return NextResponse.json(
        {
          ok: false,
          error: softwareError?.message || "Software not found",
        },
        { status: 404 }
      );
    }

    const generatedRule = normalizeRule(buildRule(software));
    
     const ruleKey = [
  generatedRule.method,
  generatedRule.registry_hive || "",
  generatedRule.registry_path || "",
  generatedRule.registry_value || "",
  generatedRule.file_path || "",
  generatedRule.version_command || "",
].join(":");

    const { data: rule, error: ruleError } = await supabase
      .from("software_detection_rules")
     .upsert(
  {
    software_id: software.id,
    ...generatedRule,
    rule_key: ruleKey,
    updated_at: new Date().toISOString(),
  },
  {
    onConflict: "software_id,platform,rule_key",
  }
)
      .select()
      .single();

    if (ruleError) {
      return NextResponse.json(
        { ok: false, error: ruleError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      software: {
        id: software.id,
        name: software.name,
        vendor: software.vendor,
        winget_id: software.winget_id,
      },
      generated_rule: rule,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}