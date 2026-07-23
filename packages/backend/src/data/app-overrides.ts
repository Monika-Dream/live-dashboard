export interface AppOverrideEntry {
  name?: string;
  statusText?: string;
}

type PlatformOverrides = Record<string, AppOverrideEntry>;

export const appOverrides: {
  windows: PlatformOverrides;
  android: PlatformOverrides;
  macos: PlatformOverrides;
  linux: PlatformOverrides;
} = {
  windows: {
    // Example:
    // "genshinimpact.exe": {
    //   name: "原神",
    //   statusText: "正在提瓦特冒险喵~",
    // },
  },
  android: {
    // Example:
    // "com.maimemo.android.momo": {
    //   name: "墨墨背单词",
    //   statusText: "正在用墨墨背单词啃单词喵~",
    // },
  },
  macos: {
    // Example:
    // "com.spotify.client": {
    //   name: "Spotify",
    //   statusText: "正在Spotify听歌喵~",
    // },
  },
  linux: {
    // Example:
    // "org.mozilla.firefox": {
    //   name: "Firefox",
    //   statusText: "正在Firefox冲浪喵~",
    // },
  },
};
