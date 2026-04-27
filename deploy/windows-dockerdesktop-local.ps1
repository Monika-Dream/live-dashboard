Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-HexToken {
	param(
		[Parameter(Mandatory = $true)]
		[int]$Bytes
	)

	$buffer = New-Object byte[] $Bytes
	[System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
	return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

function Read-EnvMap {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path
	)

	$map = [ordered]@{}
	if (-not (Test-Path $Path)) {
		return $map
	}

	foreach ($line in Get-Content $Path) {
		if ($line -match '^\s*#' -or $line -notmatch '=') {
			continue
		}
		$parts = $line -split '=', 2
		if ($parts.Count -eq 2) {
			$key = $parts[0].Trim()
			$value = $parts[1]
			if ($key) {
				$map[$key] = $value
			}
		}
	}

	return $map
}

function NeedsGeneratedValue {
	param([string]$Value)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		return $true
	}

	$trimmed = $Value.Trim().ToLowerInvariant()
	if ($trimmed.StartsWith("changeme")) {
		return $true
	}

	if ($trimmed -in @("replace_me", "todo", "null", "none")) {
		return $true
	}

	return $false
}

function Set-DefaultValue {
	param(
		[hashtable]$Map,
		[string]$Key,
		[string]$DefaultValue
	)

	$current = if ($Map.Contains($Key)) { [string]$Map[$Key] } else { "" }
	if (NeedsGeneratedValue $current) {
		$Map[$Key] = $DefaultValue
	}
}

function Set-DeviceToken {
	param(
		[hashtable]$Map,
		[string]$Key,
		[string]$DeviceId,
		[string]$DeviceName,
		[string]$Platform
	)

	$current = if ($Map.Contains($Key)) { [string]$Map[$Key] } else { "" }
	if (-not (NeedsGeneratedValue $current)) {
		return
	}

	$token = New-HexToken -Bytes 16
	$Map[$Key] = "$token`:$DeviceId`:$DeviceName`:$Platform"
}

function Test-ValidDashboardsJson {
	param([string]$Value)

	if ([string]::IsNullOrWhiteSpace($Value)) {
		return $false
	}

	try {
		$parsed = $Value | ConvertFrom-Json
		return $parsed -is [System.Array]
	}
	catch {
		return $false
	}
}

function Save-EnvMap {
	param(
		[Parameter(Mandatory = $true)]
		[string]$Path,
		[Parameter(Mandatory = $true)]
		[hashtable]$Map
	)

	$orderedKeys = @(
		"PORT",
		"STATIC_DIR",
		"DB_PATH",
		"HASH_SECRET",
		"ADMIN_TOKEN",
		"DEVICE_TOKEN_1",
		"DEVICE_TOKEN_2",
		"DEVICE_TOKEN_3",
		"DEVICE_TOKEN_4",
		"DISPLAY_NAME",
		"SITE_TITLE",
		"SITE_DESC",
		"SITE_FAVICON",
		"EXTERNAL_DASHBOARDS"
	)

	$lines = New-Object System.Collections.Generic.List[string]
	foreach ($key in $orderedKeys) {
		if ($Map.Contains($key)) {
			$lines.Add("$key=$($Map[$key])")
		}
	}

	foreach ($entry in $Map.GetEnumerator() | Sort-Object Name) {
		if ($orderedKeys -contains $entry.Key) {
			continue
		}
		$lines.Add("$($entry.Key)=$($entry.Value)")
	}

	Set-Content -Path $Path -Value $lines -Encoding utf8
}

Write-Host "[1/8] Checking Docker..."
docker --version | Out-Null
docker compose version | Out-Null

Write-Host "[2/8] Entering project root..."
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$envPath = Join-Path $repoRoot ".env"
$exampleEnvPath = Join-Path $repoRoot ".env.example"

Write-Host "[3/8] Running first-install wizard for .env..."
if (-not (Test-Path $envPath)) {
	if (Test-Path $exampleEnvPath) {
		Copy-Item $exampleEnvPath $envPath
		Write-Host "Created .env from .env.example"
	}
	else {
		Set-Content -Path $envPath -Value @() -Encoding utf8
		Write-Host "Created empty .env"
	}
}

$envMap = Read-EnvMap -Path $envPath

Set-DefaultValue -Map $envMap -Key "PORT" -DefaultValue "3000"
Set-DefaultValue -Map $envMap -Key "STATIC_DIR" -DefaultValue "/app/public"
Set-DefaultValue -Map $envMap -Key "DB_PATH" -DefaultValue "/data/live-dashboard.db"
if (NeedsGeneratedValue ([string]($envMap["HASH_SECRET"]))) {
	$envMap["HASH_SECRET"] = New-HexToken -Bytes 32
}
if (NeedsGeneratedValue ([string]($envMap["ADMIN_TOKEN"]))) {
	$envMap["ADMIN_TOKEN"] = "123456"
}

Set-DeviceToken -Map $envMap -Key "DEVICE_TOKEN_1" -DeviceId "pc-1" -DeviceName "My PC" -Platform "windows"
Set-DeviceToken -Map $envMap -Key "DEVICE_TOKEN_2" -DeviceId "phone-1" -DeviceName "My Phone" -Platform "android"
Set-DefaultValue -Map $envMap -Key "DEVICE_TOKEN_3" -DefaultValue ""
Set-DefaultValue -Map $envMap -Key "DEVICE_TOKEN_4" -DefaultValue ""
Set-DefaultValue -Map $envMap -Key "DISPLAY_NAME" -DefaultValue "xuyihong"
Set-DefaultValue -Map $envMap -Key "SITE_TITLE" -DefaultValue "xuyihong Now"
Set-DefaultValue -Map $envMap -Key "SITE_DESC" -DefaultValue "What is xuyihong doing right now?"
Set-DefaultValue -Map $envMap -Key "SITE_FAVICON" -DefaultValue "/favicon.ico"

$defaultDashboards = '[]'
if (-not (Test-ValidDashboardsJson ([string]($envMap["EXTERNAL_DASHBOARDS"])))) {
	$envMap["EXTERNAL_DASHBOARDS"] = $defaultDashboards
}

Save-EnvMap -Path $envPath -Map $envMap

$deviceToken1 = [string]$envMap["DEVICE_TOKEN_1"]
$deviceToken2 = [string]$envMap["DEVICE_TOKEN_2"]
$token1 = ($deviceToken1 -split ':', 2)[0]
$token2 = ($deviceToken2 -split ':', 2)[0]

Write-Host "Generated/loaded DEVICE_TOKEN_1: $token1"
Write-Host "Generated/loaded DEVICE_TOKEN_2: $token2"

Write-Host "[4/8] Ensuring data volume..."
docker volume create dashboard_data | Out-Null

Write-Host "[5/8] Building local image..."
docker build -t live-dashboard:local .

Write-Host "[6/8] Recreating container..."
if (docker ps -a --format "{{.Names}}" | Select-String -SimpleMatch "live-dashboard") {
	docker rm -f live-dashboard | Out-Null
}

docker run -d --name live-dashboard `
	-p 3000:3000 `
	-v dashboard_data:/data `
	--env-file .env `
	live-dashboard:local | Out-Null

Write-Host "[7/8] Verifying service..."
$config = $null
for ($attempt = 1; $attempt -le 20; $attempt++) {
	try {
		$config = Invoke-RestMethod "http://127.0.0.1:3000/api/config" -TimeoutSec 2
		break
	}
	catch {
		if ($attempt -eq 20) {
			throw
		}
	}
}

if ($null -eq $config) {
	$config = @{ dashboards = @() }
}
$panelCount = @($config.dashboards).Count

Write-Host "[8/8] Opening browser..."
Start-Process "http://127.0.0.1:3000"

Write-Host "Live Dashboard is running at: http://127.0.0.1:3000"
Write-Host "External dashboards detected: $panelCount"
