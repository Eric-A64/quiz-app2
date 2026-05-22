@echo off
cd /d "%~dp0"

echo ============================
echo 🚀 Lancement Quiz App
echo ============================

:: 1 - Lancer le serveur
start "SERVER" cmd /c "npm run start"

:: 2 - petite pause pour laisser Express démarrer
timeout /t 3 >nul

:: 3 - Lancer Electron (screen)
start "ELECTRON" cmd /c "npm run screen"

echo ============================
echo ✅ Server + Electron lancés
echo ============================

exit