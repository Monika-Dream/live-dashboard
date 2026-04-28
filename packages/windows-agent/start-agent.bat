@echo off
chcp 65001 >nul
setlocal

set "AGENT_EXE_NAME=live-dashboard-windows-agent.exe"
if not "%~1"=="" set "AGENT_EXE_NAME=%~1"

if not exist appsettings.json (
  if exist appsettings.example.json (
    copy /Y appsettings.example.json appsettings.json >nul
    echo [windows-agent] appsettings.json has been created from appsettings.example.json
  ) else (
    echo [windows-agent] appsettings.json not found.
    pause
    exit /b 1
  )
)

echo [windows-agent] starting...
if exist "%~dp0%AGENT_EXE_NAME%" (
  "%~dp0%AGENT_EXE_NAME%"
) else if exist "%~dp0WindowsAgent.exe" (
  "%~dp0WindowsAgent.exe"
) else (
  echo [windows-agent] executable not found. expected: %AGENT_EXE_NAME%
  pause
  exit /b 1
)

endlocal
