# Live Dashboard Zepp Watch Companion

Low-power Zepp OS companion app for Amazfit / Huami watches.

Health Connect via the Zepp phone app can be enough for normal health history,
but it is not a realtime watch-status channel and may not expose every metric.
This companion is intentionally conservative:

- no automatic high-frequency uploads;
- default minimum sync interval is 15 minutes;
- heart rate is sampled only when the page is opened or the user manually syncs;
- no notification text, keyboard text, clipboard, or background app data is read;
- phone-side service uploads through the same Live Dashboard device token.

Configure the app-side settings storage keys from the Zepp companion settings UI:

| Key | Value |
| --- | --- |
| `serverUrl` | `https://your-dashboard.example.com` |
| `token` | Live Dashboard device token |
| `minIntervalMs` | Optional, defaults to `900000` |

The phone-side service posts:

- `/api/report` with `app_id="zepp_watch"` and `extra.device.capability_mode="normal"`;
- `/api/health-data` for supported readings such as `heart_rate`.

This project uses ZML (`@zeppos/zml`) and targets Zepp OS API 3.0+.
