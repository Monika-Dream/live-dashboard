/**
 * Maps app_name to SuperTinyIcons SVG file names.
 * Icons are served from /icons/ (copied from SuperTinyIcons project).
 * Returns the icon path or null if no mapping exists.
 *
 * SuperTinyIcons: https://github.com/edent/SuperTinyIcons
 * License: MIT — each SVG < 1KB, 512×512 viewBox
 */

const iconMap: Record<string, string> = {
  // Browsers
  "Google Chrome": "chrome",
  "Chrome": "chrome",
  "Microsoft Edge": "edge",
  "Firefox": "firefox",
  "Safari": "safari",
  "Opera": "opera",
  "Brave": "brave",
  "Arc": "arc_browser",
  "Vivaldi": "vivaldi",

  // Messaging
  "Telegram": "telegram",
  "Discord": "discord",
  "Slack": "slack",
  "WhatsApp": "whatsapp",
  "Signal": "signal",
  "LINE": "line",
  "Line": "line",
  "Skype": "skype",
  "QQ": "tencentqq",
  "TIM": "tencentqq",
  "微信": "wechat",
  "WeChat": "wechat",
  "钉钉": "dingtalk",
  "飞书": "feishu",
  "Lark": "feishu",

  // Code editors
  "VS Code": "visualstudiocode",
  "Visual Studio Code": "visualstudiocode",
  "Visual Studio": "visualstudio",
  "IntelliJ IDEA": "jetbrains",
  "PyCharm": "jetbrains",
  "WebStorm": "jetbrains",
  "GoLand": "jetbrains",
  "JetBrains Rider": "jetbrains",
  "DataGrip": "jetbrains",
  "Android Studio": "androidstudio",
  "CLion": "jetbrains",
  "RustRover": "jetbrains",
  "Cursor": "cursor",
  "Sublime Text": "sublimetext",
  "Vim": "vim",
  "Neovim": "neovim",
  "Emacs": "gnuemacs",
  "Zed": "zedindustries",
  "Notepad++": "notepadplusplus",

  // Dev tools
  "Docker Desktop": "docker",
  "GitHub Desktop": "github",
  "Postman": "postman",
  "Wireshark": "wireshark",
  "GitKraken": "gitkraken",

  // Design
  "Figma": "figma",
  "Photoshop": "adobephotoshop",
  "Adobe Photoshop": "adobephotoshop",
  "Illustrator": "adobeillustrator",
  "Adobe Illustrator": "adobeillustrator",
  "Premiere Pro": "adobepremierepro",
  "Adobe Premiere Pro": "adobepremierepro",
  "After Effects": "adobeaftereffects",
  "Adobe After Effects": "adobeaftereffects",
  "Blender": "blender",

  // Media & entertainment
  "Spotify": "spotify",
  "YouTube": "youtube",
  "YouTube Music": "youtubemusic",
  "Netflix": "netflix",
  "Twitch": "twitch",
  "VLC": "vlcmediaplayer",
  "Apple Music": "applemusic",
  "Obsidian": "obsidian",
  "Notion": "notion",

  // Social
  "Twitter": "x",
  "X": "x",
  "Reddit": "reddit",
  "Instagram": "instagram",
  "TikTok": "tiktok",
  "Facebook": "facebook",
  "LinkedIn": "linkedin",
  "GitHub": "github",
  "GitLab": "gitlab",

  // AI
  "ChatGPT": "openai",
  "Claude": "claude",
  "Gemini": "googlegemini",
  "Copilot": "githubcopilot",
  "Microsoft Copilot": "githubcopilot",
  "DeepSeek": "deepseek",

  // Productivity
  "Microsoft Word": "microsoftword",
  "Microsoft Excel": "microsoftexcel",
  "Microsoft PowerPoint": "microsoftpowerpoint",
  "Microsoft Outlook": "microsoftoutlook",
  "Microsoft Teams": "microsoftteams",
  "Google Docs": "googledocs",
  "Google Sheets": "googlesheets",
  "Google Slides": "googleslides",
  "Google Drive": "googledrive",

  // OS/System
  "Windows Terminal": "windowsterminal",
  "PowerShell": "powershell",
  "Terminal": "apple",
  "iTerm2": "iterm2",
  "Finder": "apple",
  "文件资源管理器": "windows",
  "Settings": "gear",

  // Games
  "Steam": "steam",
  "Epic Games": "epicgames",
  "GOG Galaxy": "gog",
};

/**
 * Returns the SuperTinyIcons path for the given app name, or null.
 * Path is relative to the frontend public directory.
 */
export function getAppIcon(appName: string | null | undefined): string | null {
  if (!appName || appName === "idle") return null;
  const key = iconMap[appName];
  return key ? `/icons/${key}.svg` : null;
}
