/*
 * 快捷设置磁贴：下拉通知栏一键开关监听，同时兼作保活信号。
 *
 * 保活价值：
 *   1. TileService 被系统绑定，磁贴活跃时进程优先级提升至可见服务级别，
 *      比普通前台服务更不容易被厂商激进策略杀掉。
 *   2. Android 12+ 禁止从后台广播启动前台服务
 *      （ForegroundServiceStartNotAllowedException），
 *      但 TileService.onClick() 是官方豁免场景——磁贴点击可直接启动前台服务。
 *   3. 磁贴活跃 = 系统认为用户正在主动使用此功能 = 更不容易进后台冻结队列。
 *
 * 注：长按磁贴由 SystemUI 接管，固定跳转应用详情页，无公开 API 可覆盖。
 */
package com.monika.dashboard.service

import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class DashboardTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onTileAdded() {
        super.onTileAdded()
        DebugLog.log("磁贴", "磁贴被添加到快捷设置")
    }

    override fun onTileRemoved() {
        super.onTileRemoved()
        DebugLog.log("磁贴", "磁贴从快捷设置移除")
    }

    /** 磁贴变为可见时，从 DataStore 同步真实开关状态到磁贴外观。 */
    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    override fun onStopListening() {
        super.onStopListening()
    }

    /** 点击磁贴：切换监听开关，同时启停心跳服务。 */
    override fun onClick() {
        super.onClick()
        val tile = qsTile ?: return

        scope.launch {
            val settings = SettingsStore(applicationContext)
            val currentlyEnabled = settings.monitoringEnabled.first()
            val newEnabled = !currentlyEnabled

            settings.setMonitoringEnabled(newEnabled)

            if (newEnabled) {
                // 磁贴 onClick 是前台服务启动的豁免场景（Android 12+）
                try {
                    DashboardHeartbeatService.start(applicationContext)
                    DebugLog.log("磁贴", "已开启监听并启动心跳服务")
                } catch (e: Exception) {
                    // 极端情况退回 Worker 兜底
                    HeartbeatWorker.schedule(applicationContext, settings.reportInterval.first())
                    DebugLog.log("磁贴", "前台服务启动失败，退回 Worker: ${e.message}")
                }
            } else {
                DashboardHeartbeatService.stop(applicationContext)
                DebugLog.log("磁贴", "已关闭监听并停止心跳服务")
            }

            tile.state = if (newEnabled) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            tile.updateTile()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    /** 根据 DataStore 中的开关状态刷新磁贴外观。 */
    private fun updateTileState() {
        val tile = qsTile ?: return
        scope.launch {
            val settings = SettingsStore(applicationContext)
            val enabled = settings.monitoringEnabled.first()
            tile.state = if (enabled) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            tile.updateTile()
        }
    }
}
