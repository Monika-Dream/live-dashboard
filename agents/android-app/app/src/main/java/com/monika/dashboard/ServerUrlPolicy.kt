/*
 * 服务器地址安全策略：HTTPS 一律放行，HTTP 仅允许内网地址，防止 token 明文走公网。
 * 联动：SetupScreen 保存地址、SettingsStore 读取地址时都经过这里校验。
 */
package com.monika.dashboard

import java.net.InetAddress
import java.net.URI
import java.util.Locale

private val IPV4_PATTERN = Regex(
    """^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$"""
)

private val LOCAL_HOST_SUFFIXES = listOf(
    ".local",
    ".lan",
    ".home",
    ".internal",
    ".localdomain",
)

fun isAllowedDashboardUrl(url: String): Boolean {
    val trimmed = url.trim()
    if (trimmed.isEmpty()) return false

    val uri = runCatching { URI(trimmed) }.getOrNull() ?: return false
    val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return false
    val host = uri.host?.trim()?.lowercase(Locale.ROOT) ?: return false

    return when (scheme) {
        "https" -> true
        "http" -> isPrivateHttpHost(host)
        else -> false
    }
}

private fun isPrivateHttpHost(host: String): Boolean {
    if (host == "localhost") return true

    // 单标签主机名通常用于局域网设备，例如 http://nas:3000。
    if (!host.contains('.')) return true
    if (LOCAL_HOST_SUFFIXES.any(host::endsWith)) return true

    val address = parseLiteralAddress(host) ?: return false
    return address.isAnyLocalAddress ||
        address.isLoopbackAddress ||
        address.isSiteLocalAddress ||
        address.isLinkLocalAddress ||
        isUniqueLocalIpv6(address)
}

private fun parseLiteralAddress(host: String): InetAddress? {
    val normalized = host.removePrefix("[").removeSuffix("]")
    if (!isIpLiteral(normalized)) return null
    return runCatching { InetAddress.getByName(normalized) }.getOrNull()
}

private fun isIpLiteral(host: String): Boolean {
    return IPV4_PATTERN.matches(host) || host.contains(':')
}

private fun isUniqueLocalIpv6(address: InetAddress): Boolean {
    val bytes = address.address
    if (bytes.size != 16) return false
    return (bytes[0].toInt() and 0xFE) == 0xFC
}
