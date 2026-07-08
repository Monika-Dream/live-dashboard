/**
 * Privacy tier system for window_title handling.
 *
 * Three tiers:
 * - SHOW:    Keep window_title as display_title (video, music, game, IDE, productivity)
 * - BROWSER: Strip browser suffix, then classify (video sites → show, sensitive → hide, else show page title)
 * - HIDE:    display_title empty, window_title not stored (chat, email, banking, system, proxy)
 */

export type PrivacyTier = "show" | "browser" | "hide";

// ── App → Tier mapping ──

const tierMap = new Map<string, PrivacyTier>();

function registerTier(tier: PrivacyTier, names: string[]) {
  for (const n of names) {
    tierMap.set(n.toLowerCase(), tier);
  }
}

// SHOW — video
registerTier("show", [
  "YouTube", "哔哩哔哩", "bilibili", "Netflix",
  "爱奇艺", "优酷", "腾讯视频",
  "VLC", "PotPlayer", "mpv",
  "Twitch", "Disney+", "芒果TV", "斗鱼", "虎牙",
  "Prime Video", "HBO",
]);

// SHOW — music
registerTier("show", [
  "Spotify", "网易云音乐", "QQ音乐", "酷狗音乐",
  "Apple Music", "foobar2000",
  "YouTube Music", "酷我音乐", "Amazon Music", "AIMP",
  "Audacity",
]);

// SHOW — gaming & galgame
registerTier("show", [
  "Steam", "Epic Games",
  "Genshin Impact", "原神",
  "League of Legends", "英雄联盟",
  "崩坏3",
  "Honkai: Star Rail", "崩坏：星穹铁道",
  "Minecraft",
  "王者荣耀", "和平精英", "QQ飞车手游", "荒野行动",
  "VALORANT", "Counter-Strike 2", "CSGO",
  "Overwatch", "Apex Legends",
  "Elden Ring", "Zelda", "Roblox",
  "GOG Galaxy", "Xbox", "EA App", "Ubisoft Connect", "Battle.net",
  "明日方舟", "Arknights", "绝区零", "鸣潮", "Monika",
  // Galgame titles
  "いろとりどりのセカイ", "五彩斑斓的世界", "FAVORITE",
  "ものべの", "CLANNAD", "Fate/stay night",
  "Summer Pockets", "サマーポケッツ",
  "Doki Doki Literature Club", "WHITE ALBUM 2",
  "千恋＊万花", "Making*Lovers",
  "Sabbat of the Witch", "サノバウィッチ",
  "Riddle Joker", "喫茶ステラと死神の蝶",
  // Galgame engines
  "Kirikiri", "KiriKiri", "BGI", "SiglusEngine", "Ethornell", "CatSystem2",
]);

// SHOW — IDE & editors
registerTier("show", [
  "VS Code", "Visual Studio Code", "Visual Studio",
  "IntelliJ IDEA", "PyCharm", "WebStorm", "GoLand",
  "JetBrains Rider", "DataGrip", "Android Studio",
  "Cursor", "Sublime Text",
  "Google Antigravity", "Windsurf", "Zed",
  "CLion", "RustRover", "JetBrains Fleet", "HBuilderX",
  "Vim", "Neovim", "Emacs", "Notepad++",
]);

// SHOW — dev tools (show project/container/repo info)
registerTier("show", [
  "Docker Desktop", "GitHub Desktop",
  "Postman", "DBeaver", "Navicat",
  "Insomnia", "Wireshark", "Fiddler", "Charles Proxy",
  "GitKraken", "Sourcetree",
]);

// SHOW — design tools
registerTier("show", [
  "Figma", "Sketch",
  "Photoshop", "Adobe Photoshop",
  "Illustrator", "Adobe Illustrator",
  "Premiere Pro", "Adobe Premiere Pro",
  "After Effects", "Adobe After Effects",
  "Blender", "Cinema 4D", "GIMP", "Canva", "Adobe XD",
  "DaVinci Resolve", "剪映", "CapCut",
  "Lightroom", "Adobe Lightroom",
  "InDesign", "Adobe InDesign",
  "Affinity Photo", "Affinity Designer", "Pixelmator",
  "Paint.NET", "SAI", "Clip Studio Paint", "MediBang", "Krita",
]);

// SHOW — productivity / documents
registerTier("show", [
  "Word", "Microsoft Word",
  "Excel", "Microsoft Excel",
  "PowerPoint", "Microsoft PowerPoint",
  "OneNote", "Notion", "Obsidian", "Typora",
  "WPS Office", "WPS",
  "Google Docs", "Google Sheets", "Google Slides",
  "Logseq",
]);

// SHOW — reading
registerTier("show", [
  "Kindle", "微信读书", "多看阅读", "Apple Books", "Calibre", "墨墨背单词",
]);

// BROWSER
registerTier("browser", [
  "Google Chrome", "Chrome", "Microsoft Edge",
  "QQ浏览器", "Firefox", "Safari", "Opera", "Arc",
  "Brave", "Vivaldi", "Opera GX",
]);

// HIDE — messaging
registerTier("hide", [
  "Telegram", "QQ", "TIM", "微信", "WeChat",
  "Discord", "Line", "企业微信", "钉钉",
  "Skype", "飞书", "Lark", "Slack",
]);

// HIDE — AI assistants (conversation content is private)
registerTier("hide", [
  "ChatGPT", "Claude", "Gemini", "Copilot", "Microsoft Copilot",
  "通义千问", "文心一言", "Kimi", "豆包", "DeepSeek",
  "Poe", "Perplexity", "HuggingChat", "Ollama", "LM Studio",
]);

// HIDE — email
registerTier("hide", [
  "Outlook", "邮件", "Mail",
]);

// HIDE — system & utility
registerTier("hide", [
  "文件资源管理器", "File Explorer", "文件管理", "Finder", "Total Commander",
  "Windows Terminal", "终端", "Terminal", "PowerShell",
  "命令提示符", "Command Prompt", "iTerm2", "Termux",
  "Alacritty", "Warp", "Kitty",
  "任务管理器", "Task Manager",
  "系统设置", "设置", "Settings", "小米设置",
  "搜索", "输入法", "画图",
  "UWP 应用", "系统 Shell", "系统界面",
  "桌面", "记事本",
  "控制面板", "Control Panel",
  "天气", "录音机", "扫一扫", "便签",
]);

// HIDE — proxy
registerTier("hide", [
  "Mihomo Party", "Clash", "Clash Verge",
  "v2rayN", "Shadowrocket", "Quantumult", "Surge", "NekoBox",
]);

// HIDE — shopping / services (no need to show window_title)
registerTier("hide", [
  "淘宝", "京东", "拼多多", "唯品会",
  "美团", "美团外卖", "饿了么", "大众点评", "小米应用商店",
  "铁路12306", "携程", "百度地图", "高德地图",
  "闲鱼", "Google Play", "App Store",
  "Google Maps", "滴滴出行", "飞猪",
]);

// HIDE — social (window_title may contain private DMs)
registerTier("hide", [
  "Twitter", "X", "微博", "小红书",
  "抖音", "TikTok", "知乎", "今日头条", "百度贴吧", "腾讯新闻",
  "Reddit", "GitHub", "酷安", "百度",
  "Instagram", "Facebook", "Pinterest", "Threads",
  "快手", "B站漫画",
  "相机", "相册", "计算器", "日历", "时钟", "手机管家",
]);

// HIDE — FTP/SSH clients (connection details are sensitive)
registerTier("hide", [
  "FileZilla", "WinSCP", "PuTTY", "MobaXterm",
  "Termius", "Xshell", "SecureCRT", "Bitvise SSH Client",
  "Cyberduck", "Transmit",
]);

// ── SECRET：整个应用匿名化（比 hide 更进一步）──
//
// hide 只隐藏窗口标题，应用名本身仍会出现在时间线里；但"正在用某某银行"
// 这个事实本身就是敏感信息（同类项目如 ActivityWatch 对金融类的通行做法
// 也是整应用归并）。SECRET 集合里的应用在 report.ts 写入前就被改写为
// SECRET_APP_NAME，时长统计保留、任何可识别信息不落库不展示。
// 部署者如确实想展示某个应用，可用自定义 JSON 映射改名绕开（自担后果）。

export const SECRET_APP_NAME = "私密应用";

const secretApps = new Set<string>();

function registerSecret(names: string[]) {
  for (const name of names) secretApps.add(name.toLowerCase());
}

// 银行 / 支付清算
registerSecret([
  "中国工商银行", "工商银行", "工银", "中国农业银行", "农业银行", "中国银行",
  "中国建设银行", "建设银行", "招商银行", "交通银行", "邮储银行", "中国邮政储蓄银行",
  "浦发银行", "中信银行", "民生银行", "兴业银行", "光大银行", "华夏银行",
  "广发银行", "平安口袋银行", "平安银行", "云闪付", "数字人民币",
  "网商银行", "微众银行",
]);

// 券商 / 理财 / 加密货币
registerSecret([
  "同花顺", "东方财富", "富途牛牛", "老虎证券", "雪球", "天天基金",
  "Binance", "币安", "OKX", "欧易", "MetaMask", "imToken",
  "京东金融", "度小满", "度小满钱包", "蚂蚁财富", "腾讯自选股",
  "涨乐财富通", "国泰君安君弘", "平安证券", "广发证券易淘金",
]);

// 密码管理器 / 两步验证
registerSecret([
  "Bitwarden", "Vaultwarden", "1Password", "KeePass", "KeePassXC", "KeePassDX",
  "LastPass", "Enpass", "Dashlane", "Proton Pass",
  "Google Authenticator", "Microsoft Authenticator", "Authy", "Aegis",
  "身份验证器",
]);

// 政务 / 证件
registerSecret([
  "个人所得税", "交管12123", "国家反诈中心", "电子社保卡", "随申办",
]);

export function isSecretApp(appName: string): boolean {
  if (!appName) return false;
  return secretApps.has(appName.trim().toLowerCase());
}

// HIDE — download / cloud / remote / meeting
registerTier("hide", [
  "qBittorrent", "µTorrent", "BitComet", "迅雷",
  "IDM", "Internet Download Manager", "Motrix", "Free Download Manager",
  "Google Drive", "OneDrive", "百度网盘", "阿里云盘", "Dropbox",
  "TeamViewer", "ToDesk", "向日葵",
  "腾讯会议", "Zoom", "Microsoft Teams", "Google Meet",
  "钉钉会议", "飞书会议",
  "Trello", "Todoist", "印象笔记", "Evernote",
  "支付宝",
]);

// ── Public API ──

export function getPrivacyTier(appName: string): PrivacyTier {
  if (!appName) return "hide";
  // Default to "show" for unknown apps (e.g. games, galgame executables).
  // All sensitive categories (chat, email, finance, system, proxy, social)
  // are explicitly registered as "hide" above.
  return tierMap.get(appName.toLowerCase()) ?? "show";
}

// ── Browser suffix patterns (order matters — try longest first) ──

const browserSuffixes = [
  " - Google Chrome",
  " — Mozilla Firefox",
  " - Mozilla Firefox",
  " - Microsoft Edge",
  " - Opera",
  " - Arc",
  " - Brave",
  " - Vivaldi",
];

// ── Sensitive keywords for browser titles ──
// Conservative: if ANY of these appear in the page title, hide it entirely.
// Better to over-hide than to leak private data.

const sensitiveKeywords = [
  // Email & messaging
  "gmail", "outlook", "mail", "inbox", "邮箱", "邮件",
  "telegram", "discord", "messenger", "whatsapp", "signal",
  "slack", "teams", "聊天", "私信", "消息",
  // Auth & credentials
  "login", "log in", "登录", "signin", "sign in", "signup", "sign up", "注册",
  "password", "密码", "验证码", "verification", "two-factor", "2fa", "otp",
  "authenticate", "authorization",
  // Finance & banking
  "bank", "银行", "支付", "付款", "payment", "checkout", "结算",
  "信用卡", "credit card", "debit card", "借记卡",
  "wallet", "钱包", "转账", "transfer", "余额", "balance",
  "alipay", "支付宝", "wechat pay", "微信支付",
  "paypal", "venmo", "zelle",
  "invoice", "发票", "账单", "billing",
  // Orders & accounts
  "order", "订单", "my account", "我的账户", "个人中心",
  "account settings", "账户设置",
  // Medical & personal
  "medical", "health", "医院", "病历", "就诊",
  "insurance", "保险",
  // Admin & sensitive portals
  "admin", "dashboard", "管理后台", "控制台",
  "vpn", "proxy", "代理",
];

// ── Video-site keywords in browser tab titles ──

const videoSiteKeywords = [
  "youtube", "bilibili", "b站", "哔哩哔哩",
  "netflix", "爱奇艺", "优酷", "腾讯视频",
  "twitch", "niconico",
  "acfun", "芒果tv", "咪咕视频", "西瓜视频", "斗鱼", "虎牙",
];

// ── Title extraction helpers ──

/** Remove zero-width characters that Windows sometimes injects (e.g. Edge: "Microsoft​ Edge" has U+200B). */
function stripZeroWidth(s: string): string {
  return s.replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
}

/** Edge 多标签聚合后缀：「xxx 和另外 10 个页面」/「xxx and 10 more pages」 */
const edgeTabGroupRe = /\s*(?:和另外\s*\d+\s*个页面|and\s+\d+\s+more\s+pages?)\s*$/i;

/** Strip browser name suffix from a tab title (case-insensitive). */
function stripBrowserSuffix(title: string): string {
  const cleaned = stripZeroWidth(title);
  const lower = cleaned.toLowerCase();

  // Try Edge profile pattern first (more specific): "title - ProfileName - Microsoft Edge"
  const edgeProfileRe = /\s-\s[^-]+\s-\sMicrosoft\s*Edge$/i;
  const m = edgeProfileRe.exec(cleaned);
  if (m && m.index !== undefined) {
    return cleaned.slice(0, m.index).replace(edgeTabGroupRe, "").trim();
  }

  // Then try simple suffix matching
  for (const suffix of browserSuffixes) {
    if (lower.endsWith(suffix.toLowerCase())) {
      return cleaned.slice(0, -suffix.length).replace(edgeTabGroupRe, "").trim();
    }
  }

  return cleaned.replace(edgeTabGroupRe, "").trim();
}

/** Check if a browser title contains sensitive keywords. */
function isSensitiveBrowserTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return sensitiveKeywords.some((kw) => lower.includes(kw));
}

/** Check if a browser title is from a video site. */
function isVideoSiteTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return videoSiteKeywords.some((kw) => lower.includes(kw));
}

// ── App-specific suffix patterns to strip ──

const appSuffixes = [
  " - YouTube",
  " - Netflix",
  " _ 哔哩哔哩_bilibili",
  "_哔哩哔哩_bilibili",
  " - 哔哩哔哩",
  " - 爱奇艺",
  " - 优酷",
  " - 腾讯视频",
];

/** Strip app-name suffixes from video/music titles (case-insensitive). */
function stripAppSuffix(title: string): string {
  const cleaned = stripZeroWidth(title);
  const lower = cleaned.toLowerCase();
  for (const suffix of appSuffixes) {
    if (lower.endsWith(suffix.toLowerCase())) {
      return cleaned.slice(0, -suffix.length).trim();
    }
  }
  return cleaned;
}

/**
 * Extract meaningful part from a music player title.
 * Common formats:
 * - Spotify: "Song - Artist" or "Spotify Premium" or "Spotify Free"
 * - 网易云: "Song - Artist"
 * - foobar2000: "[HH:MM:SS] Artist - Song [foobar2000]"
 */
function extractMusicTitle(appName: string, title: string): string {
  if (!title) return "";
  const lower = title.toLowerCase();

  // Skip idle/paused states
  if (lower === "spotify" || lower === "spotify premium" || lower === "spotify free") return "";
  if (lower === "网易云音乐") return "";
  if (lower === "qq音乐") return "";

  // foobar2000: strip "[HH:MM:SS] " prefix and " [foobar2000]" suffix
  if (appName.toLowerCase() === "foobar2000") {
    let cleaned = title.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, "");
    cleaned = cleaned.replace(/\s*\[foobar2000\]$/i, "");
    return cleaned.trim();
  }

  // Generic: "Song - Artist" → keep the whole thing, it's short enough
  return stripAppSuffix(title).trim();
}

/**
 * Extract project/file name from an IDE title.
 * Common formats:
 * - VS Code: "file.ts — project — Visual Studio Code" or "project — Visual Studio Code"
 * - Cursor: same as VS Code but ends with "Cursor"
 * - JetBrains: "project – file.ts" or "project"
 * - Sublime: "file.ts - project - Sublime Text"
 */
function extractIDETitle(title: string): string {
  if (!title) return "";

  // VS Code / Cursor: split by " — " (em dash), take everything except the last segment (app name)
  if (title.includes(" — ")) {
    const parts = title.split(" — ");
    if (parts.length >= 2) {
      // Last part is the editor name; take the rest
      const meaningful = parts.slice(0, -1).join(" — ");
      return meaningful.trim();
    }
  }

  // JetBrains: split by " – " (en dash)
  if (title.includes(" – ")) {
    const parts = title.split(" – ");
    // First part is typically the project name
    return parts[0].trim();
  }

  // Sublime Text: split by " - " (hyphen), last is app name
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].trim().toLowerCase();
      if (last === "sublime text") {
        return parts.slice(0, -1).join(" - ").trim();
      }
    }
  }

  return title.trim();
}

/**
 * Extract document name from productivity app title.
 * Common formats:
 * - Word/Excel/PPT: "Document.docx - Microsoft Word"
 * - OneNote: "Section - Page - OneNote"
 * - Notion: "Page Title — Notion"
 * - Obsidian: "file.md - Vault - Obsidian"
 */
function extractDocTitle(title: string): string {
  if (!title) return "";

  // Notion: split by " — "
  if (title.includes(" — ")) {
    const parts = title.split(" — ");
    if (parts.length >= 2) {
      return parts.slice(0, -1).join(" — ").trim();
    }
  }

  // Others: split by " - ", last part is app name
  if (title.includes(" - ")) {
    const parts = title.split(" - ");
    if (parts.length >= 2) {
      return parts.slice(0, -1).join(" - ").trim();
    }
  }

  return title.trim();
}

function normalizeTitleForCompare(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s"'`“”‘’「」『』《》【】()（）[\]{}<>.,，。!！?？:：;；\-—_~·]/g, "");
}

function sanitizeDisplayTitle(appName: string, title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  if (normalizeTitleForCompare(trimmed) === normalizeTitleForCompare(appName)) {
    return "";
  }
  return trimmed;
}

// ── App category detection for title processing ──

const musicApps = new Set(
  ["spotify", "网易云音乐", "qq音乐", "酷狗音乐", "apple music", "foobar2000",
   "youtube music", "酷我音乐", "amazon music", "aimp"]
);
const ideApps = new Set([
  "vs code", "visual studio code", "visual studio",
  "intellij idea", "pycharm", "webstorm", "goland",
  "jetbrains rider", "datagrip", "android studio",
  "cursor", "sublime text",
  "google antigravity", "windsurf", "zed",
  "clion", "rustrover", "jetbrains fleet", "hbuilderx",
  "vim", "neovim", "emacs", "notepad++",
  // Dev tools (title format similar: "project - App Name")
  "docker desktop", "github desktop", "postman", "dbeaver", "navicat",
  "insomnia", "wireshark", "fiddler", "charles proxy",
  "gitkraken", "sourcetree",
]);
const videoApps = new Set([
  "youtube", "哔哩哔哩", "bilibili", "netflix",
  "爱奇艺", "优酷", "腾讯视频",
  "vlc", "potplayer", "mpv",
  "twitch", "disney+", "芒果tv", "斗鱼", "虎牙",
  "prime video", "hbo",
]);
const docApps = new Set([
  "word", "microsoft word", "excel", "microsoft excel",
  "powerpoint", "microsoft powerpoint",
  "onenote", "notion", "obsidian", "typora",
  "wps office", "wps", "google docs", "google sheets", "google slides",
  "logseq",
]);
const readingApps = new Set([
  "kindle", "微信读书", "多看阅读", "apple books", "calibre", "墨墨背单词",
]);
const designApps = new Set([
  "figma", "sketch",
  "photoshop", "adobe photoshop",
  "illustrator", "adobe illustrator",
  "premiere pro", "adobe premiere pro",
  "after effects", "adobe after effects",
  "blender", "cinema 4d", "gimp", "canva", "adobe xd",
  "davinci resolve", "剪映", "capcut",
  "lightroom", "adobe lightroom",
  "indesign", "adobe indesign",
  "affinity photo", "affinity designer", "pixelmator",
  "paint.net", "sai", "clip studio paint", "medibang", "krita",
]);

// ── Main display_title processor ──

// 超长标题（如 DevTools 带完整 URL 的窗口名）会撑爆前端布局，统一在源头截断
const MAX_DISPLAY_TITLE_LENGTH = 120;

function capDisplayTitle(title: string): string {
  if (title.length <= MAX_DISPLAY_TITLE_LENGTH) return title;
  return title.slice(0, MAX_DISPLAY_TITLE_LENGTH - 1).trimEnd() + "…";
}

/**
 * Generate a safe display_title from app_name + window_title.
 * Returns empty string if the title should be hidden.
 */
export function processDisplayTitle(appName: string, windowTitle: string): string {
  return capDisplayTitle(computeDisplayTitle(appName, windowTitle));
}

function computeDisplayTitle(appName: string, windowTitle: string): string {
  if (!appName || !windowTitle) return "";

  const tier = getPrivacyTier(appName);
  const lowerApp = appName.toLowerCase();

  if (tier === "hide") {
    return "";
  }

  if (tier === "browser") {
    // Strip browser suffix first
    const pageTitle = stripBrowserSuffix(windowTitle);
    if (!pageTitle) return "";

    // DevTools 窗口标题携带完整 URL（常含 percent-encoding），没有展示价值
    if (/^DevTools\b/i.test(pageTitle)) return "开发者工具";

    // Sensitive content → hide
    if (isSensitiveBrowserTitle(pageTitle)) return "";

    // Video site → show the video title
    if (isVideoSiteTitle(pageTitle)) {
      return stripAppSuffix(pageTitle).trim() || "";
    }

    // Other pages → show page title as-is
    return pageTitle;
  }

  // tier === "show"
  if (musicApps.has(lowerApp)) {
    return extractMusicTitle(appName, windowTitle);
  }
  if (ideApps.has(lowerApp)) {
    return sanitizeDisplayTitle(appName, extractIDETitle(windowTitle));
  }
  if (videoApps.has(lowerApp)) {
    return sanitizeDisplayTitle(appName, stripAppSuffix(windowTitle).trim());
  }
  if (docApps.has(lowerApp)) {
    return sanitizeDisplayTitle(appName, extractDocTitle(windowTitle));
  }
  if (readingApps.has(lowerApp)) {
    return sanitizeDisplayTitle(appName, extractDocTitle(windowTitle));
  }
  if (designApps.has(lowerApp)) {
    return sanitizeDisplayTitle(appName, extractDocTitle(windowTitle));
  }

  // Games, galgame, etc. — use title directly
  return windowTitle.trim();
}
