param (
    [switch]$Clean
)

# TripWeave PowerShell Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "          Starting TripWeave Travel Engine              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$rootDir = $PSScriptRoot
if (-not $rootDir) {
    $rootDir = Get-Location
}

if ($Clean) {
    $nextCache = Join-Path $rootDir "web\.next"
    Write-Host "Cleaning stale Next.js cache ($nextCache)..." -ForegroundColor Magenta
    if (Test-Path $nextCache) {
        Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
    }
}

# 1. Start FastAPI backend in a new process
Write-Host "1. Launching FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
$backendCmd = "Set-Location '$rootDir'; python -m uvicorn tripweave.main:app --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd

# 2. Start Next.js frontend in a new process
Write-Host "2. Launching Next.js Frontend on http://localhost:3000..." -ForegroundColor Yellow
$webDir = Join-Path $rootDir "web"
$frontendCmd = "Set-Location '$webDir'; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd

Write-Host ""
Write-Host "Both servers are booting up in separate terminal windows!" -ForegroundColor Green
Write-Host "- Frontend UI: http://localhost:3000" -ForegroundColor Green
Write-Host "- Backend API: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
