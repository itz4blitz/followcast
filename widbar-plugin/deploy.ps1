# Builds the Followcast WidBar widget and registers it with Windows (Developer Mode).
param([switch]$NoRestart)
$ErrorActionPreference = 'Stop'
$root    = $PSScriptRoot
$project = Join-Path $root 'src\WidBar.Followcast\WidBar.Followcast.csproj'
$publish = Join-Path $root 'artifacts\publish'
$layout  = Join-Path $root 'artifacts\layout'

$dotnetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\dotnet'
if (Test-Path (Join-Path $dotnetRoot 'dotnet.exe')) {
    $env:DOTNET_ROOT = $dotnetRoot
    $env:PATH = "$dotnetRoot;$env:PATH"
}

dotnet publish $project -c Release -o $publish --nologo
if ($LASTEXITCODE) { throw "publish failed ($LASTEXITCODE)" }

$widbarWasRunning = [bool](Get-Process WidBar -ErrorAction SilentlyContinue)
Get-Process WidBar, WidBar.Followcast -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process WidBar, WidBar.Followcast -ErrorAction SilentlyContinue | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue

for ($try = 1; Test-Path $layout; $try++) {
    try { Remove-Item $layout -Recurse -Force -ErrorAction Stop }
    catch { if ($try -ge 10) { throw }; Start-Sleep -Seconds 1 }
}
New-Item -ItemType Directory -Force "$layout\Public", "$layout\Images" | Out-Null
Copy-Item "$publish\*" $layout -Recurse

$pri = Get-ChildItem (Join-Path $root 'src\WidBar.Followcast\bin\x64\Release') -Recurse -Filter WidBar.Followcast.pri |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($pri) {
    Copy-Item $pri.FullName "$layout\resources.pri"
}
Copy-Item (Join-Path $root 'src\WidBar.Followcast\obj\widbar\plugin.json') "$layout\Public\plugin.json"
Copy-Item (Join-Path $root 'package\AppxManifest.xml') $layout
Copy-Item (Join-Path $root 'package\Images\*.png') "$layout\Images\"

Add-AppxPackage -Register "$layout\AppxManifest.xml" -ForceApplicationShutdown
Get-AppxPackage Blitz.WidBarFollowcast | Select-Object Name, Version, InstallLocation

if ($widbarWasRunning -and -not $NoRestart) {
    Start-Process 'shell:AppsFolder\30113AndreaDelBello.WidBar-WidgetTaskbarsystem_2mj5svk4jk01m!App'
}
