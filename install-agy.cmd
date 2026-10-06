@echo off
setlocal

set "AGY_INSTALLER=%TEMP%\llm-council-antigravity-install.cmd"
set "AGY_BIN=%LOCALAPPDATA%\agy\bin"
set "AGY_EXE=%AGY_BIN%\agy.exe"

echo Installing Antigravity CLI for this Windows user...
curl.exe -fsSL https://antigravity.google/cli/install.cmd -o "%AGY_INSTALLER%"
if errorlevel 1 goto download_failed

call "%AGY_INSTALLER%"
del "%AGY_INSTALLER%" >nul 2>&1

if not exist "%AGY_EXE%" goto install_failed

rem Make the CLI available in this script even if this terminal has a stale PATH.
set "PATH=%AGY_BIN%;%PATH%"

echo.
echo Antigravity CLI found at "%AGY_EXE%".
"%AGY_EXE%" --version
if errorlevel 1 goto verify_failed

echo.
echo Antigravity CLI is installed and verified.
echo From a standalone CMD, close and reopen the terminal before running agy to sign in.
echo Restart the LLM Council after sign-in and run automatic setup.
exit /b 0

:download_failed
echo Could not download the official Antigravity CLI installer.
del "%AGY_INSTALLER%" >nul 2>&1
exit /b 1

:install_failed
echo The installer finished, but "%AGY_EXE%" was not found.
echo Check the installer output and your Windows security or network settings.
exit /b 1

:verify_failed
echo The agy.exe file exists, but it did not pass the version check.
exit /b 1
