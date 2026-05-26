import { TextInput, Select, Section, View } from '@zos/settings-ui'

AppSettingsPage({
  setItem(props, key, value) {
    props.settingsStorage.setItem(key, value)
  },

  build(props) {
    const serverUrl = props.settingsStorage.getItem('serverUrl') || ''
    const token = props.settingsStorage.getItem('token') || ''
    const minIntervalMs = props.settingsStorage.getItem('minIntervalMs') || '300000'
    const relayMode = props.settingsStorage.getItem('relayMode') || 'phone-side'

    return View(
      {
        style: {
          padding: '12px 20px',
        },
      },
      [
        Section(
          {},
          [
            TextInput({
              label: '服务器地址',
              value: serverUrl,
              placeholder: 'https://your-dashboard.example.com',
              onChange: (value) => this.setItem(props, 'serverUrl', value.trim()),
            }),
            TextInput({
              label: '设备令牌',
              value: token,
              placeholder: 'Live Dashboard token',
              onChange: (value) => this.setItem(props, 'token', value.trim()),
            }),
            Select({
              label: '中继模式',
              value: relayMode,
              options: [
                { name: '手机端，低功耗', value: 'phone-side' },
              ],
              onChange: (value) => this.setItem(props, 'relayMode', value),
            }),
            TextInput({
              label: '最小间隔 (毫秒)',
              value: minIntervalMs,
              placeholder: '300000',
              onChange: (value) => {
                const cleaned = String(value || '').replace(/[^0-9]/g, '')
                this.setItem(props, 'minIntervalMs', cleaned || '300000')
              },
            }),
          ],
        ),
      ],
    )
  },
})
