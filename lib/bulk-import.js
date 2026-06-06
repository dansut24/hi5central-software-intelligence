export const BULK_IMPORT_PACKS = {
  essentials: {
    label: "Windows Essentials",
    description: "Common browsers, utilities, runtimes, editors, and remote tools.",
    items: [
      { provider: "winget", id: "Google.Chrome", category: "Browser" },
      { provider: "winget", id: "Mozilla.Firefox", category: "Browser" },
      { provider: "winget", id: "Microsoft.Edge", category: "Browser" },
      { provider: "winget", id: "Adobe.Acrobat.Reader.64-bit", category: "Documents" },
      { provider: "winget", id: "7zip.7zip", category: "Compression" },
      { provider: "winget", id: "VideoLAN.VLC", category: "Media" },
      { provider: "winget", id: "Notepad++.Notepad++", category: "Editor" },
      { provider: "winget", id: "Git.Git", category: "Developer Tool" },
      { provider: "winget", id: "Microsoft.VisualStudioCode", category: "Developer Tool" },
      { provider: "winget", id: "OpenJS.NodeJS.LTS", category: "Runtime" },
      { provider: "winget", id: "Python.Python.3.13", category: "Runtime" },
      { provider: "winget", id: "Zoom.Zoom", category: "Communication" },
      { provider: "winget", id: "Microsoft.Teams", category: "Communication" },
      { provider: "winget", id: "PuTTY.PuTTY", category: "Remote Access" },
      { provider: "winget", id: "WinSCP.WinSCP", category: "Remote Access" },
    ],
  },

  developer: {
    label: "Developer Tools",
    description: "Developer runtimes, editors, terminals, and tooling.",
    items: [
      { provider: "winget", id: "Git.Git", category: "Developer Tool" },
      { provider: "winget", id: "Microsoft.VisualStudioCode", category: "Developer Tool" },
      { provider: "winget", id: "OpenJS.NodeJS.LTS", category: "Runtime" },
      { provider: "winget", id: "Python.Python.3.13", category: "Runtime" },
      { provider: "winget", id: "Docker.DockerDesktop", category: "Developer Tool" },
      { provider: "winget", id: "GitHub.GitHubDesktop", category: "Developer Tool" },
      { provider: "winget", id: "Microsoft.PowerToys", category: "Utility" },
      { provider: "github", id: "microsoft/PowerToys", category: "Utility" },
    ],
  },

  remoteTools: {
    label: "Remote & Support Tools",
    description: "Remote access, SSH, VPN, and transfer tools.",
    items: [
      { provider: "winget", id: "PuTTY.PuTTY", category: "Remote Access" },
      { provider: "winget", id: "WinSCP.WinSCP", category: "Remote Access" },
      { provider: "winget", id: "FileZilla.FileZilla", category: "File Transfer" },
      { provider: "winget", id: "RustDesk.RustDesk", category: "Remote Access" },
      { provider: "winget", id: "tailscale.tailscale", category: "Network" },
      { provider: "github", id: "ventoy/Ventoy", category: "Utility" },
    ],
  },
};

export function getBulkImportPack(packName = "essentials") {
  const pack = BULK_IMPORT_PACKS[packName];

  if (!pack) {
    throw new Error(`Unknown bulk import pack: ${packName}`);
  }

  return pack;
}