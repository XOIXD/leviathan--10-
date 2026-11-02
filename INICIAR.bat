@echo off
chcp 65001 >nul
title LEVIATHAN - Servidor autoritativo
cd /d "%~dp0"

rem Si usas Node portable, descomenta y ajusta la siguiente línea con la ruta de tu carpeta de Node:
rem set "PATH=C:\node-portable;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro "node". Ajusta la linea "set PATH=..." de este archivo con la carpeta de tu Node portable.
  pause
  exit /b 1
)

if not exist "node_modules\socket.io" (
  echo Instalando dependencias por primera vez ^(express, socket.io, phaser^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] Fallo npm install.
    pause
    exit /b 1
  )
)

node server.js
pause
