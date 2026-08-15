[CmdletBinding()]
param(
    [Parameter()]
    [string]$LiveRoot = "Z:\copyparty",

    [Parameter()]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$Version = "v2.0.0-20260815",

    [Parameter()]
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceAssetRoot = Join-Path $projectRoot "ui-assets"
$resolvedProjectRoot = (Resolve-Path -LiteralPath $projectRoot).Path
$resolvedLiveRoot = (Resolve-Path -LiteralPath $LiveRoot).Path

if (-not (Test-Path -LiteralPath (Join-Path $resolvedProjectRoot ".git"))) {
    throw "Project root is not a Git working tree: $resolvedProjectRoot"
}

$liveAssetRoot = Join-Path $resolvedLiveRoot "ui-assets"
$liveConfig = Join-Path $resolvedLiveRoot "the.conf"
if (-not (Test-Path -LiteralPath $liveAssetRoot -PathType Container)) {
    throw "Live UI asset folder does not exist: $liveAssetRoot"
}
if (-not (Test-Path -LiteralPath $liveConfig -PathType Leaf)) {
    throw "Live config does not exist: $liveConfig"
}

$sourceJs = Join-Path $sourceAssetRoot "client-browser-ui.js"
$sourceCss = Join-Path $sourceAssetRoot "client-browser-ui.css"
if (-not (Test-Path -LiteralPath $sourceJs -PathType Leaf) -or -not (Test-Path -LiteralPath $sourceCss -PathType Leaf)) {
    throw "Source UI assets are missing from $sourceAssetRoot"
}

if ($ValidateOnly) {
    Write-Host "Deployment inputs valid."
    Write-Host "Project: $resolvedProjectRoot"
    Write-Host "Live root: $resolvedLiveRoot"
    Write-Host "Version: $Version"
    exit 0
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $resolvedLiveRoot ".ui-backups"
$backupPath = Join-Path $backupRoot $stamp
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

Copy-Item -LiteralPath $liveConfig -Destination (Join-Path $backupPath "the.conf")
Get-ChildItem -LiteralPath $liveAssetRoot -File -Filter "client-browser-ui*" | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $backupPath $_.Name)
}

$deployedJsName = "client-browser-ui-$Version.js"
$deployedCssName = "client-browser-ui-$Version.css"
$deployedJs = Join-Path $liveAssetRoot $deployedJsName
$deployedCss = Join-Path $liveAssetRoot $deployedCssName
Copy-Item -LiteralPath $sourceJs -Destination $deployedJs -Force
Copy-Item -LiteralPath $sourceCss -Destination $deployedCss -Force

$updatedConfig = foreach ($line in Get-Content -LiteralPath $liveConfig) {
    if ($line -match '^\s*csp-(?:ui|dl)\s*:\s*no\s*$') {
        continue
    }
    if ($line -match '^\s*css-browser\s*:') {
        "`tcss-browser: /ui-assets/$deployedCssName"
        continue
    }
    if ($line -match '^\s*js-browser\s*:') {
        "`tjs-browser: /ui-assets/$deployedJsName"
        continue
    }
    $line
}

Set-Content -LiteralPath $liveConfig -Value $updatedConfig -Encoding utf8NoBOM

Write-Host "Backup: $backupPath"
Write-Host "JavaScript: $deployedJs"
Write-Host "CSS: $deployedCss"
Write-Host "Config updated. Review it, then restart Copyparty."
