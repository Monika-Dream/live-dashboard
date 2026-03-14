/**
 * Dramatized app description mapping.
 * Shows app name + playful activity description for privacy-friendly display.
 * Maps app_name (from backend app-names.json) to fun descriptions.
 */

const descriptions: Record<string, string> = {
  // Messaging
  Telegram: "正在TG上冲浪喵~",
  QQ: "正在QQ上水群喵~",
  TIM: "正在TIM上水群喵~",
  微信: "正在微信上聊天喵~",
  WeChat: "正在微信上聊天喵~",
  Discord: "正在Discord灌水喵~",
  Line: "正在Line上聊天喵~",
  企业微信: "正在企业微信办公喵~",
  钉钉: "正在钉钉办公喵~",
  Skype: "正在Skype上聊天喵~",
  飞书: "正在飞书办公喵~",
  Lark: "正在飞书办公喵~",
  Slack: "正在Slack摸鱼喵~",

  // AI assistants
  ChatGPT: "正在和ChatGPT对话喵~",
  Claude: "正在和Claude对话喵~",
  Gemini: "正在和Gemini对话喵~",
  Copilot: "正在和Copilot对话喵~",
  "Microsoft Copilot": "正在和Copilot对话喵~",
  通义千问: "正在和通义千问对话喵~",
  文心一言: "正在和文心一言对话喵~",
  Kimi: "正在和Kimi对话喵~",
  豆包: "正在和豆包对话喵~",
  DeepSeek: "正在和DeepSeek对话喵~",
  Poe: "正在Poe上和AI对话喵~",
  Perplexity: "正在用Perplexity搜索喵~",
  "HuggingChat": "正在和HuggingChat对话喵~",
  Ollama: "正在本地跑AI模型喵~",
  "LM Studio": "正在本地跑AI模型喵~",

  // Browsers
  "Microsoft Edge": "正在用Edge网上冲浪喵~",
  "Google Chrome": "正在用Chrome网上冲浪喵~",
  Chrome: "正在用Chrome网上冲浪喵~",
  Firefox: "正在用Firefox网上冲浪喵~",
  Safari: "正在用Safari网上冲浪喵~",
  Opera: "正在用Opera网上冲浪喵~",
  Arc: "正在用Arc网上冲浪喵~",
  Brave: "正在用Brave网上冲浪喵~",
  Vivaldi: "正在用Vivaldi网上冲浪喵~",
  "Opera GX": "正在用Opera GX网上冲浪喵~",

  // Code editors
  "VS Code": "正在用VS Code疯狂写bug喵~",
  "Visual Studio Code": "正在用VS Code疯狂写bug喵~",
  "Visual Studio": "正在用VS写代码喵~",
  "IntelliJ IDEA": "正在用IDEA写代码喵~",
  PyCharm: "正在用PyCharm写代码喵~",
  WebStorm: "正在用WebStorm写代码喵~",
  GoLand: "正在用GoLand写代码喵~",
  "JetBrains Rider": "正在用Rider写代码喵~",
  DataGrip: "正在用DataGrip查数据库喵~",
  "Android Studio": "正在用Android Studio写代码喵~",
  Cursor: "正在用Cursor疯狂写bug喵~",
  "Sublime Text": "正在用Sublime写代码喵~",
  "Google Antigravity": "正在用Antigravity让AI帮忙写代码喵~",
  Windsurf: "正在用Windsurf写代码喵~",
  Zed: "正在用Zed写代码喵~",
  CLion: "正在用CLion写C++喵~",
  RustRover: "正在用RustRover写Rust喵~",
  "JetBrains Fleet": "正在用Fleet写代码喵~",
  HBuilderX: "正在用HBuilderX写前端喵~",
  Vim: "正在用Vim写代码喵~",
  Neovim: "正在用Neovim写代码喵~",
  Emacs: "正在用Emacs写代码喵~",
  "Notepad++": "正在用Notepad++写代码喵~",

  // Dev tools
  "Docker Desktop": "正在用Docker搞容器喵~",
  "GitHub Desktop": "正在用GitHub Desktop管理代码喵~",
  Postman: "正在用Postman调接口喵~",
  DBeaver: "正在用DBeaver查数据库喵~",
  Navicat: "正在用Navicat查数据库喵~",
  Insomnia: "正在用Insomnia调接口喵~",
  Wireshark: "正在用Wireshark抓包喵~",
  Fiddler: "正在用Fiddler抓包喵~",
  "Charles Proxy": "正在用Charles抓包喵~",
  GitKraken: "正在用GitKraken管理代码喵~",
  "Sourcetree": "正在用Sourcetree管理代码喵~",

  // Design tools
  Figma: "正在用Figma做设计喵~",
  Sketch: "正在用Sketch做设计喵~",
  Photoshop: "正在用Photoshop修图喵~",
  "Adobe Photoshop": "正在用Photoshop修图喵~",
  Illustrator: "正在用Illustrator画矢量图喵~",
  "Adobe Illustrator": "正在用Illustrator画矢量图喵~",
  "Premiere Pro": "正在用Premiere剪视频喵~",
  "Adobe Premiere Pro": "正在用Premiere剪视频喵~",
  "After Effects": "正在用AE做特效喵~",
  "Adobe After Effects": "正在用AE做特效喵~",
  Blender: "正在用Blender搞3D喵~",
  "Cinema 4D": "正在用C4D搞3D喵~",
  GIMP: "正在用GIMP修图喵~",
  Canva: "正在用Canva做设计喵~",
  "Adobe XD": "正在用XD做原型喵~",
  "DaVinci Resolve": "正在用达芬奇剪视频喵~",
  剪映: "正在用剪映剪视频喵~",
  CapCut: "正在用剪映剪视频喵~",
  Lightroom: "正在用Lightroom修照片喵~",
  "Adobe Lightroom": "正在用Lightroom修照片喵~",
  InDesign: "正在用InDesign排版喵~",
  "Adobe InDesign": "正在用InDesign排版喵~",
  "Affinity Photo": "正在用Affinity修图喵~",
  "Affinity Designer": "正在用Affinity做设计喵~",
  Pixelmator: "正在用Pixelmator修图喵~",
  "Paint.NET": "正在用Paint.NET画图喵~",
  SAI: "正在用SAI画画喵~",
  "Clip Studio Paint": "正在用CSP画画喵~",
  MediBang: "正在用MediBang画画喵~",
  Krita: "正在用Krita画画喵~",

  // File managers
  文件资源管理器: "正在翻文件夹找东西喵~",
  "File Explorer": "正在翻文件夹找东西喵~",
  文件管理: "正在翻文件夹找东西喵~",
  Finder: "正在翻文件夹找东西喵~",
  "Total Commander": "正在翻文件夹找东西喵~",

  // Terminals
  "Windows Terminal": "正在用命令行敲命令喵~",
  终端: "正在用命令行敲命令喵~",
  Terminal: "正在用命令行敲命令喵~",
  PowerShell: "正在用命令行敲命令喵~",
  命令提示符: "正在用命令行敲命令喵~",
  "Command Prompt": "正在用命令行敲命令喵~",
  iTerm2: "正在用命令行敲命令喵~",
  Termux: "正在Termux里搞事情喵~",
  Alacritty: "正在用命令行敲命令喵~",
  Warp: "正在用Warp敲命令喵~",
  Kitty: "正在用命令行敲命令喵~",

  // Video
  哔哩哔哩: "正在B站划水摸鱼喵~",
  bilibili: "正在B站划水摸鱼喵~",
  YouTube: "正在YouTube看视频喵~",
  Netflix: "正在Netflix追剧喵~",
  爱奇艺: "正在爱奇艺追剧喵~",
  优酷: "正在优酷追剧喵~",
  腾讯视频: "正在腾讯视频追剧喵~",
  VLC: "正在用VLC看视频喵~",
  PotPlayer: "正在用PotPlayer看视频喵~",
  mpv: "正在用mpv看视频喵~",
  Twitch: "正在Twitch看直播喵~",
  "Disney+": "正在Disney+追剧喵~",
  芒果TV: "正在芒果TV追剧喵~",
  斗鱼: "正在斗鱼看直播喵~",
  虎牙: "正在虎牙看直播喵~",
  "Prime Video": "正在Prime Video追剧喵~",
  HBO: "正在HBO追剧喵~",

  // Music
  Spotify: "正在Spotify听歌喵~",
  网易云音乐: "正在网易云听歌喵~",
  "QQ音乐": "正在QQ音乐听歌喵~",
  酷狗音乐: "正在酷狗听歌喵~",
  "Apple Music": "正在Apple Music听歌喵~",
  foobar2000: "正在用foobar2000听歌喵~",
  "YouTube Music": "正在YouTube Music听歌喵~",
  酷我音乐: "正在酷我听歌喵~",
  "Amazon Music": "正在Amazon Music听歌喵~",
  AIMP: "正在用AIMP听歌喵~",
  Audacity: "正在用Audacity编辑音频喵~",

  // Gaming
  Steam: "正在Steam玩游戏喵~",
  "Epic Games": "正在Epic玩游戏喵~",
  "Genshin Impact": "正在提瓦特冒险喵~",
  原神: "正在提瓦特冒险喵~",
  "League of Legends": "正在峡谷激战喵~",
  英雄联盟: "正在峡谷激战喵~",
  "Honkai: Star Rail": "正在星穹铁道开拓喵~",
  "崩坏：星穹铁道": "正在星穹铁道开拓喵~",
  Minecraft: "正在Minecraft挖矿喵~",
  "王者荣耀": "正在王者峡谷激战喵~",
  "和平精英": "正在吃鸡喵~",
  VALORANT: "正在VALORANT对枪喵~",
  "Counter-Strike 2": "正在CS2对枪喵~",
  CSGO: "正在CSGO对枪喵~",
  Overwatch: "正在守望先锋战斗喵~",
  "Apex Legends": "正在Apex大逃杀喵~",
  "Elden Ring": "正在交界地冒险喵~",
  "Zelda": "正在海拉鲁冒险喵~",
  Roblox: "正在Roblox玩喵~",
  "GOG Galaxy": "正在GOG玩游戏喵~",
  "Xbox": "正在Xbox玩游戏喵~",
  "EA App": "正在EA玩游戏喵~",
  "Ubisoft Connect": "正在育碧玩游戏喵~",
  "Battle.net": "正在暴雪玩游戏喵~",
  "明日方舟": "正在罗德岛指挥作战喵~",
  "Arknights": "正在罗德岛指挥作战喵~",
  "绝区零": "正在绝区零战斗喵~",
  "鸣潮": "正在鸣潮冒险喵~",

  // Galgame / Visual Novels
  "いろとりどりのセカイ": "正在攻略gal喵~",
  "五彩斑斓的世界": "正在攻略gal喵~",
  FAVORITE: "正在攻略gal喵~",
  "ものべの": "正在攻略gal喵~",
  CLANNAD: "正在攻略gal喵~",
  "Fate/stay night": "正在攻略gal喵~",
  "Summer Pockets": "正在攻略gal喵~",
  "サマーポケッツ": "正在攻略gal喵~",
  "Doki Doki Literature Club": "正在攻略gal喵~",
  "WHITE ALBUM 2": "正在攻略gal喵~",
  "千恋＊万花": "正在攻略gal喵~",
  "Making*Lovers": "正在攻略gal喵~",
  "Sabbat of the Witch": "正在攻略gal喵~",
  "サノバウィッチ": "正在攻略gal喵~",
  "Riddle Joker": "正在攻略gal喵~",
  "喫茶ステラと死神の蝶": "正在攻略gal喵~",
  Kirikiri: "正在攻略gal喵~",
  KiriKiri: "正在攻略gal喵~",
  BGI: "正在攻略gal喵~",
  SiglusEngine: "正在攻略gal喵~",
  Ethornell: "正在攻略gal喵~",
  CatSystem2: "正在攻略gal喵~",

  // Productivity
  Word: "正在用Word写文档喵~",
  "Microsoft Word": "正在用Word写文档喵~",
  Excel: "正在用Excel算数据喵~",
  "Microsoft Excel": "正在用Excel算数据喵~",
  PowerPoint: "正在做PPT喵~",
  "Microsoft PowerPoint": "正在做PPT喵~",
  OneNote: "正在用OneNote记笔记喵~",
  Notion: "正在用Notion记笔记喵~",
  Obsidian: "正在用Obsidian记笔记喵~",
  Typora: "正在用Typora记笔记喵~",
  记事本: "正在用记事本写东西喵~",
  "WPS Office": "正在用WPS办公喵~",
  WPS: "正在用WPS办公喵~",
  "Google Docs": "正在用Google文档写东西喵~",
  "Google Sheets": "正在用Google表格算数据喵~",
  "Google Slides": "正在用Google幻灯片做PPT喵~",
  Trello: "正在用Trello管理任务喵~",
  Todoist: "正在用Todoist管理待办喵~",
  "Logseq": "正在用Logseq记笔记喵~",
  印象笔记: "正在用印象笔记记东西喵~",
  Evernote: "正在用印象笔记记东西喵~",

  // Reading / E-book
  Kindle: "正在Kindle看书喵~",
  微信读书: "正在微信读书看书喵~",
  "多看阅读": "正在多看阅读看书喵~",
  "Apple Books": "正在看书喵~",
  Calibre: "正在用Calibre看书喵~",

  // Social / Reading
  Twitter: "正在刷推特喵~",
  X: "正在刷推特喵~",
  微博: "正在微博吃瓜喵~",
  小红书: "正在逛小红书喵~",
  抖音: "正在刷短视频喵~",
  TikTok: "正在刷短视频喵~",
  知乎: "正在知乎涨知识喵~",
  今日头条: "正在刷今日头条喵~",
  Reddit: "正在Reddit冲浪喵~",
  GitHub: "正在GitHub摸鱼喵~",
  酷安: "正在酷安逛帖子喵~",
  百度: "正在百度搜东西喵~",
  Instagram: "正在刷Instagram喵~",
  Facebook: "正在逛Facebook喵~",
  Pinterest: "正在Pinterest找灵感喵~",
  Threads: "正在刷Threads喵~",
  快手: "正在刷快手喵~",
  B站漫画: "正在B站看漫画喵~",

  // Proxy tools
  "Mihomo Party": "正在调代理设置喵~",
  Clash: "正在调代理设置喵~",
  "Clash Verge": "正在调代理设置喵~",
  v2rayN: "正在调代理设置喵~",
  Shadowrocket: "正在调代理设置喵~",
  Quantumult: "正在调代理设置喵~",
  Surge: "正在调代理设置喵~",
  NekoBox: "正在调代理设置喵~",

  // Download / Transfer
  qBittorrent: "正在下载东西喵~",
  "µTorrent": "正在下载东西喵~",
  BitComet: "正在下载东西喵~",
  迅雷: "正在用迅雷下载喵~",
  IDM: "正在用IDM下载喵~",
  "Internet Download Manager": "正在用IDM下载喵~",
  Motrix: "正在下载东西喵~",
  "Free Download Manager": "正在下载东西喵~",

  // Cloud storage
  "Google Drive": "正在用Google云端硬盘喵~",
  OneDrive: "正在用OneDrive同步文件喵~",
  百度网盘: "正在用百度网盘喵~",
  阿里云盘: "正在用阿里云盘喵~",
  Dropbox: "正在用Dropbox同步文件喵~",

  // Remote desktop / Meeting
  "TeamViewer": "正在远程控制喵~",
  "ToDesk": "正在远程控制喵~",
  向日葵: "正在远程控制喵~",
  腾讯会议: "正在开会喵~",
  Zoom: "正在开会喵~",
  "Microsoft Teams": "正在用Teams开会喵~",
  "Google Meet": "正在开会喵~",
  钉钉会议: "正在开会喵~",
  飞书会议: "正在开会喵~",

  // System
  任务管理器: "正在看任务管理器喵~",
  "Task Manager": "正在看任务管理器喵~",
  系统设置: "正在调系统设置喵~",
  设置: "正在调设置喵~",
  Settings: "正在调设置喵~",
  小米设置: "正在调手机设置喵~",
  搜索: "正在搜索东西喵~",
  输入法: "正在打字喵~",
  画图: "正在画画喵~",
  "UWP 应用": "正在用UWP应用喵~",
  "系统 Shell": "在系统界面喵~",
  系统界面: "在系统界面喵~",
  "控制面板": "正在调系统设置喵~",
  "Control Panel": "正在调系统设置喵~",

  // Android specific
  桌面: "在主屏幕发呆中喵~",
  相机: "正在拍照喵~",
  相册: "正在翻相册喵~",
  计算器: "正在算数喵~",
  日历: "正在看日历喵~",
  时钟: "正在看时间喵~",
  手机管家: "正在清理手机喵~",
  天气: "正在看天气喵~",
  录音机: "正在录音喵~",
  扫一扫: "正在扫码喵~",
  便签: "正在记便签喵~",

  // Shopping / Services
  支付宝: "正在用支付宝喵~",
  淘宝: "正在逛淘宝剁手喵~",
  京东: "正在逛京东剁手喵~",
  拼多多: "正在拼多多砍一刀喵~",
  唯品会: "正在唯品会逛特卖喵~",
  美团: "正在美团点外卖喵~",
  饿了么: "正在饿了么点外卖喵~",
  大众点评: "正在大众点评找好吃的喵~",
  小米应用商店: "正在逛应用商店喵~",
  闲鱼: "正在逛闲鱼淘二手喵~",
  "Google Play": "正在逛应用商店喵~",
  "App Store": "正在逛应用商店喵~",

  // Travel
  铁路12306: "正在12306买火车票喵~",
  携程: "正在携程订行程喵~",
  百度地图: "正在看地图喵~",
  高德地图: "正在看地图喵~",
  "Google Maps": "正在看地图喵~",
  滴滴出行: "正在叫车喵~",
  飞猪: "正在飞猪订行程喵~",
};

const DEFAULT_DESCRIPTION = "正在忙别的喵~";

// Pre-build lowercase index for O(1) lookups
const lowerIndex = new Map<string, string>();
for (const [key, value] of Object.entries(descriptions)) {
  lowerIndex.set(key.toLowerCase(), value);
}

// ── Display title templates by app category ──
// When displayTitle is available, use a richer template with the title embedded.

type TitleTemplate = (displayTitle: string) => string;

const titleTemplates = new Map<string, TitleTemplate>();

function registerTemplate(names: string[], template: TitleTemplate) {
  for (const n of names) {
    titleTemplates.set(n.toLowerCase(), template);
  }
}

// Video apps
registerTemplate(
  ["YouTube"],
  (t) => `正在YouTube看「${t}」喵~`
);
registerTemplate(
  ["哔哩哔哩", "bilibili"],
  (t) => `正在B站看「${t}」喵~`
);
registerTemplate(
  ["Netflix"],
  (t) => `正在Netflix看「${t}」喵~`
);
registerTemplate(
  ["爱奇艺"],
  (t) => `正在爱奇艺看「${t}」喵~`
);
registerTemplate(
  ["优酷"],
  (t) => `正在优酷看「${t}」喵~`
);
registerTemplate(
  ["腾讯视频"],
  (t) => `正在腾讯视频看「${t}」喵~`
);
registerTemplate(
  ["VLC", "PotPlayer", "mpv"],
  (t) => `正在看「${t}」喵~`
);
// New video platforms
registerTemplate(
  ["Twitch"],
  (t) => `正在Twitch看「${t}」喵~`
);
registerTemplate(
  ["Disney+"],
  (t) => `正在Disney+看「${t}」喵~`
);
registerTemplate(
  ["芒果TV"],
  (t) => `正在芒果TV看「${t}」喵~`
);
registerTemplate(
  ["斗鱼"],
  (t) => `正在斗鱼看「${t}」喵~`
);
registerTemplate(
  ["虎牙"],
  (t) => `正在虎牙看「${t}」喵~`
);
registerTemplate(
  ["Prime Video"],
  (t) => `正在Prime Video看「${t}」喵~`
);
registerTemplate(
  ["HBO"],
  (t) => `正在HBO看「${t}」喵~`
);

// Music apps
registerTemplate(
  ["Spotify"],
  (t) => `正在Spotify听「${t}」喵~`
);
registerTemplate(
  ["网易云音乐"],
  (t) => `正在网易云听「${t}」喵~`
);
registerTemplate(
  ["QQ音乐"],
  (t) => `正在QQ音乐听「${t}」喵~`
);
registerTemplate(
  ["酷狗音乐"],
  (t) => `正在酷狗听「${t}」喵~`
);
registerTemplate(
  ["Apple Music"],
  (t) => `正在Apple Music听「${t}」喵~`
);
registerTemplate(
  ["foobar2000"],
  (t) => `正在听「${t}」喵~`
);
registerTemplate(
  ["YouTube Music"],
  (t) => `正在YouTube Music听「${t}」喵~`
);
registerTemplate(
  ["酷我音乐"],
  (t) => `正在酷我听「${t}」喵~`
);
registerTemplate(
  ["Amazon Music"],
  (t) => `正在Amazon Music听「${t}」喵~`
);
registerTemplate(
  ["AIMP"],
  (t) => `正在听「${t}」喵~`
);

// IDE / editors
registerTemplate(
  ["VS Code", "Visual Studio Code"],
  (t) => `正在用VS Code写「${t}」喵~`
);
registerTemplate(
  ["Cursor"],
  (t) => `正在用Cursor写「${t}」喵~`
);
registerTemplate(
  ["IntelliJ IDEA"],
  (t) => `正在用IDEA写「${t}」喵~`
);
registerTemplate(
  ["PyCharm", "WebStorm", "GoLand", "JetBrains Rider", "DataGrip", "Android Studio"],
  (t) => `正在写「${t}」喵~`
);
registerTemplate(
  ["Sublime Text"],
  (t) => `正在用Sublime写「${t}」喵~`
);
registerTemplate(
  ["Visual Studio"],
  (t) => `正在用VS写「${t}」喵~`
);
registerTemplate(
  ["Google Antigravity"],
  (t) => `正在用Antigravity写「${t}」喵~`
);
registerTemplate(
  ["Windsurf"],
  (t) => `正在用Windsurf写「${t}」喵~`
);
registerTemplate(
  ["Zed"],
  (t) => `正在用Zed写「${t}」喵~`
);
registerTemplate(
  ["CLion", "RustRover", "JetBrains Fleet", "HBuilderX"],
  (t) => `正在写「${t}」喵~`
);
registerTemplate(
  ["Vim", "Neovim"],
  (t) => `正在用Vim写「${t}」喵~`
);
registerTemplate(
  ["Emacs"],
  (t) => `正在用Emacs写「${t}」喵~`
);
registerTemplate(
  ["Notepad++"],
  (t) => `正在用Notepad++写「${t}」喵~`
);

// Dev tools
registerTemplate(
  ["Docker Desktop"],
  (t) => `正在用Docker搞「${t}」喵~`
);
registerTemplate(
  ["GitHub Desktop"],
  (t) => `正在GitHub上搞「${t}」喵~`
);
registerTemplate(
  ["Postman"],
  (t) => `正在用Postman调「${t}」喵~`
);
registerTemplate(
  ["DBeaver", "Navicat"],
  (t) => `正在查「${t}」数据库喵~`
);
registerTemplate(
  ["Insomnia"],
  (t) => `正在用Insomnia调「${t}」喵~`
);
registerTemplate(
  ["GitKraken"],
  (t) => `正在用GitKraken搞「${t}」喵~`
);
registerTemplate(
  ["Sourcetree"],
  (t) => `正在用Sourcetree搞「${t}」喵~`
);

// Gaming platforms — displayTitle IS the game title
registerTemplate(
  ["Steam"],
  (t) => `正在Steam玩「${t}」喵~`
);
registerTemplate(
  ["Epic Games"],
  (t) => `正在Epic玩「${t}」喵~`
);
registerTemplate(
  ["GOG Galaxy"],
  (t) => `正在GOG玩「${t}」喵~`
);
registerTemplate(
  ["Xbox"],
  (t) => `正在Xbox玩「${t}」喵~`
);
registerTemplate(
  ["EA App"],
  (t) => `正在EA玩「${t}」喵~`
);
registerTemplate(
  ["Ubisoft Connect"],
  (t) => `正在育碧玩「${t}」喵~`
);
registerTemplate(
  ["Battle.net"],
  (t) => `正在暴雪玩「${t}」喵~`
);
// Galgame engines — show gal title
registerTemplate(
  [
    "Kirikiri", "KiriKiri", "BGI", "SiglusEngine", "Ethornell", "CatSystem2",
    "いろとりどりのセカイ", "五彩斑斓的世界", "FAVORITE", "ものべの",
    "CLANNAD", "Fate/stay night", "Summer Pockets", "サマーポケッツ",
    "Doki Doki Literature Club", "WHITE ALBUM 2", "千恋＊万花",
    "Making*Lovers", "Sabbat of the Witch", "サノバウィッチ",
    "Riddle Joker", "喫茶ステラと死神の蝶",
  ],
  (t) => `正在攻略「${t}」喵~`
);

// Productivity
registerTemplate(
  ["Word", "Microsoft Word"],
  (t) => `正在用Word写「${t}」喵~`
);
registerTemplate(
  ["Excel", "Microsoft Excel"],
  (t) => `正在用Excel看「${t}」喵~`
);
registerTemplate(
  ["PowerPoint", "Microsoft PowerPoint"],
  (t) => `正在做「${t}」PPT喵~`
);
registerTemplate(
  ["OneNote"],
  (t) => `正在OneNote写「${t}」喵~`
);
registerTemplate(
  ["Notion"],
  (t) => `正在Notion看「${t}」喵~`
);
registerTemplate(
  ["Obsidian"],
  (t) => `正在Obsidian写「${t}」喵~`
);
registerTemplate(
  ["Typora"],
  (t) => `正在Typora写「${t}」喵~`
);
registerTemplate(
  ["WPS Office", "WPS"],
  (t) => `正在用WPS写「${t}」喵~`
);
registerTemplate(
  ["Google Docs"],
  (t) => `正在Google文档写「${t}」喵~`
);
registerTemplate(
  ["Logseq"],
  (t) => `正在Logseq写「${t}」喵~`
);

// Design tools
registerTemplate(
  ["Figma"],
  (t) => `正在用Figma做「${t}」喵~`
);
registerTemplate(
  ["Photoshop", "Adobe Photoshop"],
  (t) => `正在用Photoshop修「${t}」喵~`
);
registerTemplate(
  ["Illustrator", "Adobe Illustrator"],
  (t) => `正在用Illustrator画「${t}」喵~`
);
registerTemplate(
  ["Premiere Pro", "Adobe Premiere Pro"],
  (t) => `正在用Premiere剪「${t}」喵~`
);
registerTemplate(
  ["After Effects", "Adobe After Effects"],
  (t) => `正在用AE做「${t}」喵~`
);
registerTemplate(
  ["Blender"],
  (t) => `正在用Blender搞「${t}」喵~`
);
registerTemplate(
  ["DaVinci Resolve"],
  (t) => `正在用达芬奇剪「${t}」喵~`
);
registerTemplate(
  ["剪映", "CapCut"],
  (t) => `正在用剪映剪「${t}」喵~`
);
registerTemplate(
  ["Lightroom", "Adobe Lightroom"],
  (t) => `正在用Lightroom修「${t}」喵~`
);
registerTemplate(
  ["SAI", "Clip Studio Paint", "MediBang", "Krita"],
  (t) => `正在画「${t}」喵~`
);

// Reading
registerTemplate(
  ["Kindle"],
  (t) => `正在Kindle看「${t}」喵~`
);
registerTemplate(
  ["微信读书"],
  (t) => `正在微信读书看「${t}」喵~`
);

// Browser — when display_title is available (video site page, generic page title)
registerTemplate(
  ["Google Chrome", "Chrome"],
  (t) => `正在用Chrome看「${t}」喵~`
);
registerTemplate(
  ["Microsoft Edge"],
  (t) => `正在用Edge看「${t}」喵~`
);
registerTemplate(
  ["Firefox"],
  (t) => `正在用Firefox看「${t}」喵~`
);
registerTemplate(
  ["Safari", "Opera", "Arc"],
  (t) => `正在看「${t}」喵~`
);
registerTemplate(
  ["Brave"],
  (t) => `正在用Brave看「${t}」喵~`
);
registerTemplate(
  ["Vivaldi"],
  (t) => `正在用Vivaldi看「${t}」喵~`
);

export function getAppDescription(appName: string, displayTitle?: string): string {
  if (!appName) return DEFAULT_DESCRIPTION;

  // If we have a display_title, try to use a rich template
  if (displayTitle) {
    const template = titleTemplates.get(appName.toLowerCase());
    if (template) {
      return template(displayTitle);
    }
  }

  // Known app without template → use generic description
  const desc = lowerIndex.get(appName.toLowerCase());
  if (desc) return desc;

  // Unknown app with a display title → show it (games, galgame, etc.)
  if (displayTitle) {
    return `正在玩「${displayTitle}」喵~`;
  }

  return DEFAULT_DESCRIPTION;
}
