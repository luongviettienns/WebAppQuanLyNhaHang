@echo off
title CRISPY BITE Launcher
echo ===================================================
echo   DANG KHOI CHAY HE THONG CRISPY BITE QSR (FULL-STACK)
echo ===================================================
echo.
echo [1/2] Dang khoi chay Backend Server (Port 4000)...
start "CRISPY BITE - Backend API" cmd /k "npm run dev:backend"

timeout /t 3 /nobreak >nul

echo [2/2] Dang khoi chay Frontend Expo (Port 8081)...
start "CRISPY BITE - Frontend Web" cmd /k "npm run dev:frontend"

echo.
echo ===================================================
echo   KHOI CHAY HOAN TAT!
echo   - Backend Server: http://localhost:4000
echo   - Swagger API Docs: http://localhost:4000/api-docs
echo   - Frontend Web: Nhan phim 'w' tai cua so Frontend
echo     hoac truy cap: http://localhost:8081
echo ===================================================
echo.
pause
