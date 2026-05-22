@echo off
REM ------------------------------
REM Launcher Quiz-App avec Ngrok v3
REM ------------------------------

REM Se placer dans le dossier du script
cd /d "%~dp0"

REM Afficher un message
echo Démarrage du serveur Quiz...

REM Lancer le serveur via Node (launcher.js)
node launcher.js

REM Pause pour que la fenêtre reste ouverte si erreur
pause