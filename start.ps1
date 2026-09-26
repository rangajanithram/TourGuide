# TripWeave PowerShell Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "          Starting TripWeave Travel Engine              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Start FastAPI backend in a new process
Write-Host "1. Launching FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m uvicorn tripweave.main:app --port 8000 --reload"

# 2. Start Next.js frontend in a new process
Write-Host "2. Launching Next.js Frontend on http://localhost:3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd web; npm run dev"

Write-Host ""
Write-Host "Both servers are booting up in separate terminal windows!" -ForegroundColor Green
Write-Host "- Frontend UI: http://localhost:3000" -ForegroundColor Green
Write-Host "- Backend API: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
