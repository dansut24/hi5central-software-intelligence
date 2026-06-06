const WINGET_REPO = "microsoft/winget-pkgs";
const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Hi5Central-Software-Intelligence",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

export function wingetIdToManifestPath(wingetId) {
  const parts = String(wingetId || "").split(".");
  const packageId = parts.join("/");
  const firstLetter = parts[0]?.charAt(0)?.toLowerCase();

  if (!firstLetter || parts.length < 2) {
    throw new Error("Invalid winget_id");
  }

  return `manifests/${firstLetter}/${packageId}`;
}

export async function githubJson(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: githubHeaders(),
  });

  if (!res.ok) {
    throw new Error(`GitHub request failed HTTP ${res.status}: ${url}`);
  }

  return res.json();
}

function sortVersionsNewestFirst(items) {
  return [...items].sort((a, b) =>
    b.name.localeCompare(a.name, undefined, { numeric: true })
  );
}

function isPreReleaseName(name = "") {
  const clean = name.toLowerCase();

  return (
    clean.includes("pre-release") ||
    clean.includes("prerelease") ||
    clean.includes("preview") ||
    clean.includes("beta") ||
    clean.includes("alpha") ||
    clean.includes("nightly") ||
    clean.includes("-rc") ||
    clean.includes("rc-")
  );
}

function stableDirsFirst(items) {
  const stable = items.filter((item) => !isPreReleaseName(item.path || item.name));
  const unstable = items.filter((item) => isPreReleaseName(item.path || item.name));

  return [
    ...sortVersionsNewestFirst(stable),
    ...sortVersionsNewestFirst(unstable),
  ];
}

export async function searchWinget(query, limit = 10) {
  const q = encodeURIComponent(
    `${query} repo:${WINGET_REPO} path:manifests extension:yaml`
  );
  const url = `${GITHUB_API}/search/code?q=${q}&per_page=${limit * 5}`;

  const json = await githubJson(url);
  const seen = new Map();

  for (const item of json.items || []) {
    const path = item.path || "";

    const match = path.match(
      /^manifests\/[^/]+\/(.+)\/([^/]+)\/[^/]+\.yaml$/
    );

    if (!match) continue;

    const packagePath = match[1];
    const version = match[2];
    const wingetId = packagePath.split("/").join(".");

    if (!seen.has(wingetId)) {
      seen.set(wingetId, {
        winget_id: wingetId,
        latest_seen_version: version,
        path,
        html_url: item.html_url,
      });
    }
  }

  const basicResults = [...seen.values()].slice(0, limit);
  const enrichedResults = [];

  for (const item of basicResults) {
    try {
      const details = await getWingetPackageDetails(item.winget_id);

      enrichedResults.push({
        ...item,
        latest_version: details.version,
        name: details.name,
        vendor: details.vendor,
        installer_type: details.installer_type,
        download_url: details.download_url,
        source_url: details.source_url,
        importable: Boolean(details.download_url),
      });
    } catch (error) {
      enrichedResults.push({
        ...item,
        latest_version: item.latest_seen_version,
        importable: false,
        error: error.message,
      });
    }
  }

  return enrichedResults;
}

export async function getManifestFiles(wingetId) {
  let currentPath = wingetIdToManifestPath(wingetId);

  for (let depth = 0; depth < 6; depth++) {
    const url = `${GITHUB_API}/repos/${WINGET_REPO}/contents/${currentPath}`;
    const items = await githubJson(url);

    const yamlFiles = (items || []).filter(
      (item) => item.type === "file" && item.name.endsWith(".yaml")
    );

    if (yamlFiles.length > 0) {
      const version = currentPath.split("/").pop();

      return {
        version,
        manifestPath: currentPath,
        files: yamlFiles,
      };
    }

    const dirs = stableDirsFirst(
      (items || []).filter((item) => item.type === "dir")
    );

    if (!dirs.length) {
      throw new Error(`No manifest files found for ${wingetId} at ${currentPath}`);
    }

    currentPath = dirs[0].path;
  }

  throw new Error(`Could not resolve manifest files for ${wingetId}`);
}

export async function fetchRawManifestFile(downloadUrl) {
  const res = await fetch(downloadUrl, {
    cache: "no-store",
    headers: githubHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Manifest download failed HTTP ${res.status}`);
  }

  return res.text();
}

function stripYamlValue(value = "") {
  return String(value)
    .replace(/^["']|["']$/g, "")
    .trim();
}

function readYamlValue(text, key) {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = text.match(regex);
  return stripYamlValue(match?.[1] || "");
}

function readYamlNestedValue(text, section, key) {
  const lines = String(text || "").split(/\r?\n/);
  let inSection = false;
  let sectionIndent = -1;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    const trimmed = line.trim();

    if (trimmed === `${section}:`) {
      inSection = true;
      sectionIndent = indent;
      continue;
    }

    if (inSection && indent <= sectionIndent && !trimmed.startsWith("-")) {
      inSection = false;
      sectionIndent = -1;
    }

    if (inSection) {
      const match = trimmed.match(new RegExp(`^${key}:\\s*(.+)$`));
      if (match) return stripYamlValue(match[1]);
    }
  }

  return "";
}

function readFirstInstallerUrl(text) {
  const match = text.match(/InstallerUrl:\s*(.+)/);
  return stripYamlValue(match?.[1] || "");
}

function readFirstInstallerSha256(text) {
  const match = text.match(/InstallerSha256:\s*(.+)/);
  return stripYamlValue(match?.[1] || "");
}

function readInstallerType(text) {
  const value = readYamlValue(text, "InstallerType").toLowerCase();

  if (value.includes("msi")) return "msi";
  if (value.includes("msix")) return "msix";
  if (value.includes("zip")) return "zip";
  if (value.includes("nullsoft")) return "nullsoft";
  if (value.includes("inno")) return "inno";
  if (value.includes("burn")) return "burn";
  if (value.includes("wix")) return "wix";

  return value || "exe";
}

function inferSilentArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  if (installerType === "zip") return "extract";
  if (installerType === "inno") return "/VERYSILENT /NORESTART";
  if (installerType === "nullsoft") return "/S";
  if (installerType === "burn" || installerType === "wix") return "/quiet /norestart";
  return "/S";
}

function inferSilentUninstallArgs(installerType, silentInstallArgs) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Remove-AppxPackage";
  if (installerType === "zip") return "";
  if (installerType === "inno") return "/VERYSILENT /NORESTART";
  if (installerType === "nullsoft") return "/S";
  if (installerType === "burn" || installerType === "wix") return "/quiet /norestart";
  return silentInstallArgs || "/S";
}

function readInstallerSwitches(text, installerType) {
  const silent =
    readYamlNestedValue(text, "InstallerSwitches", "Silent") ||
    readYamlNestedValue(text, "InstallerSwitches", "SilentWithProgress") ||
    inferSilentArgs(installerType);

  const silentWithProgress =
    readYamlNestedValue(text, "InstallerSwitches", "SilentWithProgress") || "";

  const custom =
    readYamlNestedValue(text, "InstallerSwitches", "Custom") || "";

  const installLocation =
    readYamlNestedValue(text, "InstallerSwitches", "InstallLocation") || "";

  const log =
    readYamlNestedValue(text, "InstallerSwitches", "Log") || "";

  const uninstallSilent =
    readYamlNestedValue(text, "InstallerSwitches", "SilentUninstall") ||
    inferSilentUninstallArgs(installerType, silent);

  return {
    silent,
    silentWithProgress,
    custom,
    installLocation,
    log,
    uninstallSilent,
  };
}

function readListValues(text, section) {
  const lines = String(text || "").split(/\r?\n/);
  const values = [];
  let inSection = false;
  let sectionIndent = -1;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    const trimmed = line.trim();

    if (trimmed === `${section}:`) {
      inSection = true;
      sectionIndent = indent;
      continue;
    }

    if (inSection && indent <= sectionIndent && !trimmed.startsWith("-")) {
      break;
    }

    if (inSection && trimmed.startsWith("-")) {
      values.push(stripYamlValue(trimmed.replace(/^-/, "").trim()));
    }
  }

  return values;
}

function readAppsAndFeaturesEntries(text) {
  const entries = [];
  const lines = String(text || "").split(/\r?\n/);

  let inSection = false;
  let sectionIndent = -1;
  let current = null;

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    const trimmed = line.trim();

    if (trimmed === "AppsAndFeaturesEntries:") {
      inSection = true;
      sectionIndent = indent;
      continue;
    }

    if (inSection && indent <= sectionIndent && !trimmed.startsWith("-")) {
      break;
    }

    if (!inSection) continue;

    if (trimmed.startsWith("-")) {
      if (current) entries.push(current);
      current = {};

      const inline = trimmed.replace(/^-/, "").trim();
      const inlineMatch = inline.match(/^([^:]+):\s*(.+)$/);

      if (inlineMatch) {
        current[inlineMatch[1].trim()] = stripYamlValue(inlineMatch[2]);
      }

      continue;
    }

    if (current) {
      const match = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        current[match[1].trim()] = stripYamlValue(match[2]);
      }
    }
  }

  if (current) entries.push(current);

  return entries;
}

function readInstallModes(text) {
  return readListValues(text, "InstallModes");
}

function buildManifestMetadata(installerText) {
  const installerType = readInstallerType(installerText);
  const switches = readInstallerSwitches(installerText, installerType);

  return {
    installer_type: installerType,
    installer_switches: switches,
    scope: readYamlValue(installerText, "Scope"),
    upgrade_behavior: readYamlValue(installerText, "UpgradeBehavior"),
    install_modes: readInstallModes(installerText),
    apps_and_features_entries: readAppsAndFeaturesEntries(installerText),
    installer_sha256: readFirstInstallerSha256(installerText),
  };
}

export async function getWingetPackageDetails(wingetId) {
  const manifest = await getManifestFiles(wingetId);

  let localeText = "";
  let installerText = "";
  let defaultText = "";

  for (const file of manifest.files) {
    if (!file.name.endsWith(".yaml")) continue;

    const text = await fetchRawManifestFile(file.download_url);

    if (
      file.name.endsWith(".locale.en-US.yaml") ||
      file.name.endsWith(".locale.yaml")
    ) {
      localeText = text;
    }

    if (file.name === `${wingetId}.yaml`) {
      defaultText = text;
    }

    if (text.includes("InstallerUrl:") || text.includes("Installers:")) {
      installerText = text;
    }
  }

  if (!installerText) {
    throw new Error(
      `No installer manifest found for ${wingetId}. Files: ${manifest.files
        .map((file) => file.name)
        .join(", ")}`
    );
  }

  const metadataText = localeText || defaultText || installerText;
  const manifestMetadata = buildManifestMetadata(installerText);

  const name =
    readYamlValue(metadataText, "PackageName") ||
    readYamlValue(installerText, "PackageName") ||
    wingetId;

  const vendor =
    readYamlValue(metadataText, "Publisher") ||
    readYamlValue(installerText, "Publisher") ||
    "";

  const homepageUrl =
    readYamlValue(metadataText, "PackageUrl") ||
    readYamlValue(metadataText, "PublisherUrl") ||
    "";

  const downloadUrl = readFirstInstallerUrl(installerText);

  if (!downloadUrl) {
    throw new Error(`No InstallerUrl found for ${wingetId}`);
  }

  return {
    winget_id: wingetId,
    name,
    vendor,
    version: manifest.version,
    homepage_url: homepageUrl,
    installer_type: manifestMetadata.installer_type,
    download_url: downloadUrl,
    silent_install_args: manifestMetadata.installer_switches.silent,
    silent_uninstall_args: manifestMetadata.installer_switches.uninstallSilent,
    checksum: manifestMetadata.installer_sha256 || null,
    checksum_type: manifestMetadata.installer_sha256 ? "sha256" : null,
    manifest_metadata: manifestMetadata,
    source_url: `https://github.com/${WINGET_REPO}/tree/master/${manifest.manifestPath}`,
  };
}