import { BaseApp } from '@zeppos/zml/base-app'

App(
  BaseApp({
    globalData: {},
    onCreate() {
      this.log('Live Dashboard watch app created')
    },
    onDestroy() {
      this.log('Live Dashboard watch app destroyed')
    },
  }),
)
