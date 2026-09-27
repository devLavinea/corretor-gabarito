@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo     CORRETOR MARINEIDE - INSTALACAO
echo ==============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao esta instalado.
  echo Instale o Node.js LTS e execute este arquivo novamente.
  pause
  exit /b 1
)
node -v
npm -v
echo.
echo Instalando dependencias novas...
call npm install
if errorlevel 1 (
  echo.
  echo ERRO no npm install.
  pause
  exit /b 1
)
echo.
echo Iniciando o Corretor Marineide...
call npm run dev
pause
