package com.monika.dashboard.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// Matching the web dashboard's warm color palette
val Cream = Color(0xFFFFF8E7)
val SakuraBg = Color(0xFFFFF0F3)
val Card = Color(0xFFFFFDF7)
val Border = Color(0xFFE8D5C4)
val Primary = Color(0xFFE8A0BF)
val Secondary = Color(0xFF88C9C9)
val Accent = Color(0xFFE8B86D)
val TextMain = Color(0xFF2D2B2B)
val TextMuted = Color(0xFF8B7E74)

private val DashboardColorScheme = lightColorScheme(
    primary = Primary,
    secondary = Secondary,
    tertiary = Accent,
    background = Cream,
    surface = Card,
    onPrimary = Color.White,
    onSecondary = Color.White,
    onTertiary = Color.White,
    onBackground = TextMain,
    onSurface = TextMain,
    outline = Border,
    surfaceVariant = SakuraBg,
    onSurfaceVariant = TextMuted
)

private val DashboardTypography = Typography(
    headlineLarge = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        color = TextMain
    ),
    headlineMedium = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        color = TextMain
    ),
    titleMedium = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        color = TextMain
    ),
    bodyLarge = TextStyle(
        fontSize = 16.sp,
        color = TextMain
    ),
    bodyMedium = TextStyle(
        fontSize = 14.sp,
        color = TextMain
    ),
    bodySmall = TextStyle(
        fontSize = 12.sp,
        color = TextMuted
    ),
    labelLarge = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        fontFamily = FontFamily.Monospace,
        color = TextMain
    )
)

@Composable
fun DashboardTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DashboardColorScheme,
        typography = DashboardTypography,
        content = content
    )
}
