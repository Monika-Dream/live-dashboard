import { BasePage } from '@zeppos/zml/base-page'
import { HeartRate } from '@zos/sensor'
import { createWidget, widget, align, text_style, prop } from '@zos/ui'

const heartRate = new HeartRate()

Page(
  BasePage({
    name: 'live-dashboard.home',
    state: {
      statusText: 'Ready',
      lastHeartRate: 0,
    },

    build() {
      this.title = createWidget(widget.TEXT, {
        x: 24,
        y: 80,
        w: 432,
        h: 56,
        color: 0xffffff,
        text_size: 28,
        align_h: align.CENTER_H,
        text_style: text_style.NONE,
        text: 'Live Dashboard',
      })

      this.status = createWidget(widget.TEXT, {
        x: 24,
        y: 150,
        w: 432,
        h: 80,
        color: 0xcccccc,
        text_size: 22,
        align_h: align.CENTER_H,
        text_style: text_style.WRAP,
        text: this.state.statusText,
      })

      this.button = createWidget(widget.BUTTON, {
        x: 90,
        y: 260,
        w: 300,
        h: 72,
        radius: 16,
        normal_color: 0x2f7dd1,
        press_color: 0x1f5fa8,
        text: 'Sync once',
        text_size: 24,
        click_func: () => this.syncOnce(true),
      })
    },

    onInit() {
      this.syncOnce(false)
    },

    syncOnce(force) {
      const heart_rate = heartRate.getCurrent()
      this.state.lastHeartRate = heart_rate || 0
      this.updateStatus('Syncing...')
      return this.request({
        method: 'watch.snapshot',
        params: {
          force,
          heart_rate,
          recorded_at: Date.now(),
        },
      })
        .then((result) => {
          if (result?.skipped) {
            this.updateStatus('Skipped to save battery')
          } else {
            this.updateStatus(`Synced HR ${heart_rate || '--'}`)
          }
        })
        .catch((error) => {
          this.updateStatus(`Sync failed: ${error}`)
        })
    },

    updateStatus(text) {
      this.state.statusText = text
      this.status?.setProperty(prop.TEXT, text)
    },
  }),
)
