import { BaseSideService } from '@zeppos/zml/base-side'

const DEFAULT_MIN_INTERVAL_MS = 15 * 60 * 1000
const MAX_RECORDS_PER_SYNC = 10

function readSetting(settings, key, fallback = '') {
  const value = settings.getItem(key)
  return value == null || value === '' ? fallback : value
}

function trimServerUrl(url) {
  return String(url || '').replace(/\/+$/, '')
}

function asNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

AppSideService(
  BaseSideService({
    state: {
      lastSyncAt: 0,
    },

    onInit() {
      this.log('Live Dashboard side service init')
    },

    onRequest(req, res) {
      if (req.method !== 'watch.snapshot') {
        res('unsupported method')
        return
      }

      this.handleSnapshot(req.params || {})
        .then((result) => res(null, result))
        .catch((error) => res(error?.message || 'sync failed'))
    },

    async handleSnapshot(snapshot) {
      const now = Date.now()
      const minInterval = asNumber(
        readSetting(this.settings, 'minIntervalMs', DEFAULT_MIN_INTERVAL_MS),
        DEFAULT_MIN_INTERVAL_MS,
      )
      const force = snapshot.force === true

      if (!force && now - this.state.lastSyncAt < minInterval) {
        return { ok: true, skipped: true, reason: 'rate_limited' }
      }

      const serverUrl = trimServerUrl(readSetting(this.settings, 'serverUrl'))
      const token = readSetting(this.settings, 'token')
      if (!serverUrl || !token) {
        return { ok: false, skipped: true, reason: 'missing_config' }
      }

      await this.postJson(serverUrl, token, '/api/report', {
        app_id: 'zepp_watch',
        window_title: 'zepp_watch',
        timestamp: new Date(now).toISOString(),
        extra: {
          device: {
            capability_mode: 'normal',
            last_sample_at: new Date(now).toISOString(),
          },
        },
      })

      const records = []
      if (typeof snapshot.heart_rate === 'number' && snapshot.heart_rate > 0) {
        records.push({
          type: 'heart_rate',
          value: snapshot.heart_rate,
          unit: 'bpm',
          timestamp: new Date(snapshot.recorded_at || now).toISOString(),
        })
      }

      if (records.length > 0) {
        await this.postJson(serverUrl, token, '/api/health-data', {
          records: records.slice(0, MAX_RECORDS_PER_SYNC),
        })
      }

      this.state.lastSyncAt = now
      this.settings.setItem('lastSyncAt', String(now))
      return { ok: true, uploaded_records: records.length }
    },

    postJson(serverUrl, token, path, body) {
      return this.fetch({
        method: 'POST',
        url: `${serverUrl}${path}`,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }).then((result) => {
        if (result.status < 200 || result.status >= 300) {
          throw new Error(`HTTP ${result.status}`)
        }
        return result
      })
    },
  }),
)
