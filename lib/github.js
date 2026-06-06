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

async function githubJson(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: githubHeaders(),
  });

  if (!res.ok) {
    throw new Error(`GitHub request failed HTTP ${res.status}: ${url}`);
  }

  return res.json();
}

function cleanVersion(tag = "") {
  return String(tag)
    .replace(/^v/i, "")
    .replace(/^release-/i, "")
    .trim();
}

function inferInstallerType(name = "") {
  const lower = name.toLowerCase();

  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".msix")) return "msix";
  if (lower.endsWith(".zip")) return "zip";
  return "exe";
}

function inferSilentArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  if (installerType === "zip") return "";
  return "/S";
}

function assetLooksWindowsInstaller(assetName = "") {
  const name = assetName.toLowerCase();

  if (!name.match(/\.(exe|msi|msix|zip)$/)) return false;

  if (
    name.includes("linux") ||
    name.includes("mac") ||
    name.includes("darwin") ||
    name.includes("arm64") ||
    name.includes("aarch64") ||
    name.includes("portable") ||
    name.includes("source")
  ) {
    return false;
  }

  return (
    name.includes("win") ||
    name.includes("windows") ||
    name.includes("x64") ||
    name.includes("setup") ||
    name.includes("installer")
  );
}

function pickBestWindowsAsset(assets = []) {
  const candidates = assets.filter((asset) =>
    assetLooksWindowsInstaller(asset.name)
  );

  const preferred =
    candidates.find((asset) => asset.name.toLowerCase().endsWith(".msi")) ||
    candidates.find((asset) => asset.name.toLowerCase().includes("setup")) ||
    candidates.find((asset) => asset.name.toLowerCase().includes("installer")) ||
    candidates.find((asset) => asset.name.toLowerCase().endsWith(".exe")) ||
    candidates[0];

  return preferred || null;
}

export async function searchGithubRepositories(query, limit = 10) {
  const q = encodeURIComponent(`${query} in:name,description`);
  const url = `${GITHUB_API}/search/repositories?q=${q}&sort=stars&order=desc&per_page=${limit}`;

  const json = await githubJson(url);

  return (json.items || []).map((repo) => ({
    source: "github",
    package_id: repo.full_name,
    name: repo.name,
    vendor: repo.owner?.login || "",
    description: repo.description || "",
    stars: repo.stargazers_count || 0,
    html_url: repo.html_url,
    latest_version: "",
    importable: true,
  }));
}

export async function getGithubReleaseDetails(ownerRepo) {
  const [owner, repo] = String(ownerRepo || "").split("/");

  if (!owner || !repo) {
    throw new Error("GitHub package_id must be owner/repo");
  }

  const release = await githubJson(
    `${GITHUB_API}/repos/${owner}/${repo}/releases/latest`
  );

  const asset = pickBestWindowsAsset(release.assets || []);

  if (!asset) {
    throw new Error(`No Windows installer asset found for ${ownerRepo}`);
  }

  const installerType = inferInstallerType(asset.name);

  return {
    source: "github",
    package_id: ownerRepo,
    name: repo,
    vendor: owner,
    version: cleanVersion(release.tag_name),
    release_url: release.html_url,
    installer_type: installerType,
    download_url: asset.browser_download_url,
    asset_name: asset.name,
    silent_install_args: inferSilentArgs(installerType),
    silent_uninstall_args: installerType === "msi" ? "/qn /norestart" : "/S",
    homepage_url: `https://github.com/${ownerRepo}`,
  };
}