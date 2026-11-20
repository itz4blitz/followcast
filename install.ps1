# Followcast installer for Windows (x64)
# Usage: irm https://raw.githubusercontent.com/itz4blitz/followcast/master/install.ps1 | iex
param(
    [string]$Version = 'latest',
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\followcast'),
    [switch]$AutoStart
)

$ErrorActionPreference = 'Stop'
$repo = 'itz4blitz/followcast'
$assetName = 'followcast-win-x64.zip'

if ($Version -eq 'latest') {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'followcast-installer' }
    $tag = $release.tag_name
} else {
    $tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers @{ 'User-Agent' = 'followcast-installer' }
}

$asset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
if (-not $asset) {
    throw "Release $tag does not contain $assetName."
}

$tmpZip = Join-Path ([System.IO.Path]::GetTempPath()) "followcast-$tag.zip"
Write-Host "Downloading Followcast $tag ($assetName)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmpZip -UseBasicParsing

Get-Process followcast, win32_desktop, win32_surface -ErrorAction SilentlyContinue | Stop-Process -Force
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Expand-Archive -Path $tmpZip -DestinationPath $InstallDir -Force
Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue

# Add InstallDir to user PATH if missing
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = if ($userPath) { $userPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) } else { @() }
if (-not ($entries | Where-Object { $_.TrimEnd('\') -ieq $InstallDir.TrimEnd('\') })) {
    $newPath = ($entries + $InstallDir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    $env:Path = "$InstallDir;$env:Path"
    Write-Host "Added $InstallDir to your user PATH."
}

# Start Menu shortcut
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $startMenu 'Followcast.lnk'))
$shortcut.TargetPath = Join-Path $InstallDir 'followcast.exe'
$shortcut.WorkingDirectory = $InstallDir
$shortcut.Description = 'Followcast cross-platform share window'
$shortcut.Save()

if ($AutoStart) {
    $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    $autoShortcut = $shell.CreateShortcut((Join-Path $startup 'Followcast.lnk'))
    $autoShortcut.TargetPath = Join-Path $InstallDir 'followcast.exe'
    $autoShortcut.WorkingDirectory = $InstallDir
    $autoShortcut.Save()
    Write-Host "Enabled Followcast at Windows sign-in."
}

Write-Host "Installed Followcast $tag to $InstallDir"
Write-Host "Run 'followcast' in a new terminal (or launch Followcast from the Start Menu)."
