@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem One-click dev startup for PaperFlow (backend + frontend).
rem Double-click this file to run.

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "VENV_DIR=%ROOT%\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "ENV_FILE=%ROOT%\.env"
set "ENV_EXAMPLE=%ROOT%\.env.example"

set "BACKEND_HOST=127.0.0.1"
set "BACKEND_PORT=8000"
set "FRONTEND_PORT=3000"

set "FORCE_INSTALL=0"
if /i "%~1"=="--install" set "FORCE_INSTALL=1"
if /i "%~1"=="-i" set "FORCE_INSTALL=1"
if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h" goto :help

if not exist "%BACKEND_DIR%\main.py" (
  echo [ERROR] Missing "%BACKEND_DIR%\main.py"
  goto :fail
)
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Missing "%FRONTEND_DIR%\package.json"
  goto :fail
)

if not exist "%ENV_FILE%" (
  if exist "%ENV_EXAMPLE%" (
    copy /Y "%ENV_EXAMPLE%" "%ENV_FILE%" >nul
    echo [WARN] Created "%ENV_FILE%". Please set JWT_SECRET_KEY before first use.
  )
)

where python >nul 2>&1
if errorlevel 1 (
  echo [ERROR] "python" not found in PATH.
  goto :fail
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] "npm" not found in PATH.
    goto :fail
  )
)

set "NEED_PIP=0"
if not exist "%VENV_PY%" (
  echo [INFO] Creating venv: "%VENV_DIR%"
  python -m venv "%VENV_DIR%"
  if errorlevel 1 goto :fail
  set "NEED_PIP=1"
)

if "%FORCE_INSTALL%"=="1" set "NEED_PIP=1"
if "%NEED_PIP%"=="0" (
  "%VENV_PY%" -c "import uvicorn" >nul 2>&1
  if errorlevel 1 set "NEED_PIP=1"
)

if "%NEED_PIP%"=="1" (
  echo [INFO] Installing Python dependencies...
  "%VENV_PY%" -m pip install -r "%ROOT%\requirements.txt"
  if errorlevel 1 goto :fail
  "%VENV_PY%" -m pip install -r "%BACKEND_DIR%\requirements.txt"
  if errorlevel 1 goto :fail
)

set "NEED_NPM=0"
if "%FORCE_INSTALL%"=="1" set "NEED_NPM=1"
if not exist "%FRONTEND_DIR%\node_modules" set "NEED_NPM=1"
if "%NEED_NPM%"=="1" (
  echo [INFO] Installing frontend dependencies...
  pushd "%FRONTEND_DIR%"
  call npm install
  if errorlevel 1 (popd & goto :fail)
  popd
)

echo [INFO] Starting servers...

start "PaperFlow Backend" /D "%ROOT%" cmd /k ""%VENV_PY%" -m uvicorn backend.main:app --reload --host %BACKEND_HOST% --port %BACKEND_PORT%"
start "PaperFlow Frontend" /D "%FRONTEND_DIR%" cmd /k "set \"PAPERFLOW_BACKEND_URL=http://%BACKEND_HOST%:%BACKEND_PORT%\"&& npm run dev -- -p %FRONTEND_PORT%"

echo [INFO] Backend:  http://%BACKEND_HOST%:%BACKEND_PORT%/docs
echo [INFO] Frontend: http://localhost:%FRONTEND_PORT%
exit /b 0

:help
echo Usage:
echo   dev.bat            - start backend + frontend
echo   dev.bat --install  - (re)install deps then start
exit /b 0

:fail
echo.
echo [ERROR] Startup failed. Fix the error above and try again.
pause
exit /b 1
