export const STARTER_DETECTION_RULES = [
  {
    winget_id: "Google.Chrome",
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Google\\Chrome\\BLBeacon",
    registry_value: "version",
  },
  {
    winget_id: "Mozilla.Firefox",
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Mozilla\\Mozilla Firefox",
    registry_value: "CurrentVersion",
  },
  {
    winget_id: "Microsoft.Edge",
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Microsoft\\Edge\\BLBeacon",
    registry_value: "version",
  },
  {
    winget_id: "Microsoft.VisualStudioCode",
    method: "registry",
    registry_hive: "HKCU",
    registry_path:
      "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1",
    registry_value: "DisplayVersion",
  },
  {
    winget_id: "OpenJS.NodeJS.LTS",
    method: "command",
    version_command: "node --version",
  },
  {
    winget_id: "Git.Git",
    method: "command",
    version_command: "git --version",
  },
  {
    winget_id: "7zip.7zip",
    method: "file",
    file_path: "C:\\Program Files\\7-Zip\\7z.exe",
  },
  {
    winget_id: "Notepad++.Notepad++",
    method: "file",
    file_path: "C:\\Program Files\\Notepad++\\notepad++.exe",
  },
  {
    winget_id: "VideoLAN.VLC",
    method: "file",
    file_path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
  },
  {
    winget_id: "PuTTY.PuTTY",
    method: "file",
    file_path: "C:\\Program Files\\PuTTY\\putty.exe",
  },
  {
    winget_id: "Zoom.Zoom",
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Zoom\\Zoom Meetings\\General",
    registry_value: "Version",
  },
  {
    winget_id: "Microsoft.Teams",
    method: "file",
    file_path: "C:\\Program Files\\WindowsApps\\MSTeams_*\\ms-teams.exe",
  },
  {
    winget_id: "Docker.DockerDesktop",
    method: "file",
    file_path: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
  },
  {
    winget_id: "Microsoft.PowerToys",
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PowerToys",
    registry_value: "DisplayVersion",
  },
  {
    winget_id: "Bitwarden.Bitwarden",
    method: "file",
    file_path: "C:\\Program Files\\Bitwarden\\Bitwarden.exe",
  },
  {
    winget_id: "KeePassXCTeam.KeePassXC",
    method: "file",
    file_path: "C:\\Program Files\\KeePassXC\\KeePassXC.exe",
  },
  {
    winget_id: "tailscale.tailscale",
    method: "file",
    file_path: "C:\\Program Files\\Tailscale\\tailscale-ipn.exe",
  },
  {
    winget_id: "RustDesk.RustDesk",
    method: "file",
    file_path: "C:\\Program Files\\RustDesk\\rustdesk.exe",
  },
  {
    winget_id: "TheDocumentFoundation.LibreOffice",
    method: "file",
    file_path: "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
  },
  {
    winget_id: "GitHub.GitHubDesktop",
    method: "file",
    file_path: "%LOCALAPPDATA%\\GitHubDesktop\\GitHubDesktop.exe",
  },
  {
    winget_id: "Python.Python.3.13",
    method: "command",
    version_command: "python --version",
  },
];