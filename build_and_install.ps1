# build_and_install.ps1
# Builds LLM Switcher and installs a shortcut to the Start Menu

$appName = "LLM Switcher"
$appPath = $PSScriptRoot
$exePath = Join-Path $appPath "dist\LLM Switcher-win32-x64\LLM Switcher.exe"
$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Torres"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Building $appName..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Set-Location $appPath

# Run the build
npm run dist

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed for $appName! Skipping shortcut creation." -ForegroundColor Red
    exit $LASTEXITCODE
}

if (Test-Path $exePath) {
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path $startMenuPath "$appName.lnk"
    Write-Host "Creating shortcut at: $shortcutPath" -ForegroundColor Green
    
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = Join-Path $appPath "dist\$appName-win32-x64"
    $shortcut.Description = "Launch $appName"
    $shortcut.Save()
    
    $configSrc = Join-Path $appPath "config.json"
    $configDest = Join-Path $appPath "dist\$appName-win32-x64\config.json"
    if (Test-Path $configSrc) {
        Copy-Item -Path $configSrc -Destination $configDest -Force
        Write-Host "Copied config.json to build directory." -ForegroundColor Green
    }
    
    Write-Host "Successfully installed $appName to Start Menu!" -ForegroundColor Green
} else {
    Write-Host "Could not find executable at $exePath!" -ForegroundColor Red
}
