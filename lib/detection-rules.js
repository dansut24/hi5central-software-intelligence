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
    registry_path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{771FD6B0-FA20-440A-A002-3B3BAC16DC50}_is1",
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
];