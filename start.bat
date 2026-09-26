@echo off
title TripWeave Launcher
echo ========================================================
echo           Starting TripWeave Travel Engine
echo ========================================================
echo.

echo 1. Launching FastAPI Backend on port 8000...
start "TripWeave Backend (Port 8000)" cmd /k "python -m uvicorn tripweave.main:app --port 8000 --reload"

echo 2. Launching Next.js Frontend on port 3000...
cd web
start "TripWeave Frontend (Port 3000)" cmd /k "npm run dev"
cd ..

echo.
echo ========================================================
echo TripWeave is booting up!
echo - Frontend UI:  http://localhost:3000
echo - Backend API:  http://127.0.0.1:8000/docs
echo ========================================================
pause
