@echo off
rem Export pentru Unreal Engine: dublu-click. Are nevoie de Node.js (https://nodejs.org, versiunea LTS) si de Microsoft Edge.
rem Rezultatul: folderul unreal-export langa folderul game (apoi unreal\import_poiana.py in Unreal Editor).
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Instaleaza Node.js LTS de pe https://nodejs.org si ruleaza din nou. & pause & exit /b 1)
if not exist node_modules\playwright-core (
  echo Instalez playwright-core...
  call npm install --no-audit --no-fund || (pause & exit /b 1)
)
node tools\export-unreal.mjs %*
pause
