param(
    [string]$Version = "dev",
    [string]$Runtime = "win-x64",
    [string]$PackageName = "live-dashboard-windows-agent",
    [string]$DisplayName = "Live Dashboard Windows Agent",
    [string]$Tagline = "Windows foreground reporter for Live Dashboard.",
    [string]$PostInstallNote = 'If you see "OK ..." in console, reporting works.',
    [string]$DotnetPath = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

function Normalize-FileName {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    $normalized = $Value.Trim()
    foreach ($char in [System.IO.Path]::GetInvalidFileNameChars()) {
        $normalized = $normalized.Replace([string]$char, "-")
    }

    $normalized = ($normalized -replace "\s+", "-").Trim(".")

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        throw "PackageName is empty or invalid after normalization."
    }

    return $normalized
}

function Resolve-Dotnet {
    if (-not [string]::IsNullOrWhiteSpace($DotnetPath)) {
        if (Test-Path $DotnetPath) {
            return $DotnetPath
        }

        throw "Specified DotnetPath does not exist: $DotnetPath"
    }

    $cmd = Get-Command dotnet -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    $fallback = "C:\Program Files\dotnet\dotnet.exe"
    if (Test-Path $fallback) {
        return $fallback
    }

    throw "dotnet not found. Please install .NET SDK 10+ or add dotnet to PATH."
}

$dotnet = Resolve-Dotnet
$safePackageName = Normalize-FileName -Value $PackageName
$packageExeName = "$safePackageName.exe"
$publishDir = Join-Path $scriptDir "publish\$runtime"
$stageDir = Join-Path $scriptDir "dist\$safePackageName"
$zipName = "$safePackageName-$runtime.zip"
$zipPath = Join-Path $scriptDir "dist\$zipName"

$publishMode = "self-contained"

if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }
if (Test-Path $stageDir) { Remove-Item -Recurse -Force $stageDir }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

& $dotnet publish ".\WindowsAgent.csproj" `
    -c Release `
    -r $runtime `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:DebugType=None `
    -p:DebugSymbols=false `
    -o $publishDir

if ($LASTEXITCODE -ne 0) {
    Write-Warning "Self-contained publish failed. Falling back to framework-dependent package."
    $publishMode = "framework-dependent"

    if (Test-Path $publishDir) { Remove-Item -Recurse -Force $publishDir }

    & $dotnet publish ".\WindowsAgent.csproj" `
        -c Release `
        -r $runtime `
        --self-contained false `
        -p:DebugType=None `
        -p:DebugSymbols=false `
        -o $publishDir

    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed in both self-contained and framework-dependent modes."
    }
}

New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Copy-Item (Join-Path $publishDir "*") $stageDir -Recurse -Force

if (Test-Path (Join-Path $stageDir "WindowsAgent.exe")) {
    Copy-Item (Join-Path $stageDir "WindowsAgent.exe") (Join-Path $stageDir $packageExeName) -Force
}

Copy-Item ".\appsettings.example.json" (Join-Path $stageDir "appsettings.example.json") -Force
Copy-Item ".\appsettings.example.json" (Join-Path $stageDir "appsettings.json") -Force

$startScriptTemplate = Get-Content ".\start-agent.bat" -Raw
$startScriptContent = $startScriptTemplate.Replace("live-dashboard-windows-agent.exe", $packageExeName)
Set-Content -Path (Join-Path $stageDir "start-agent.bat") -Value $startScriptContent -Encoding ASCII

$readmeTxt = @"
$DisplayName
Version: $Version
Package Name: $safePackageName
Package Mode: $publishMode

$Tagline

How to use:
1. Edit appsettings.json
2. Fill serverUrl and token
3. Double-click start-agent.bat

$PostInstallNote

If Package Mode is framework-dependent, install .NET Runtime 10 x64 first.
"@

Set-Content -Path (Join-Path $stageDir "README.txt") -Value $readmeTxt -Encoding UTF8

$packageMeta = [ordered]@{
    version = $Version
    runtime = $runtime
    packageName = $safePackageName
    displayName = $DisplayName
    packageMode = $publishMode
    executableName = $packageExeName
}

$packageMeta | ConvertTo-Json | Set-Content -Path (Join-Path $stageDir "package-meta.json") -Encoding UTF8

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Done: $zipPath"
