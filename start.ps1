# LLM Council - Start script for Windows (PowerShell)
# Usage:  powershell -ExecutionPolicy Bypass -File .\start.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# Check the tools first, with a clear message instead of a PowerShell stack trace
$uv = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uv) {
    Write-Host "uv was not found." -ForegroundColor Red
    Write-Host 'Install it:  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
    Write-Host "Then close and reopen the terminal and run this script again."
    exit 1
}
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) {
    Write-Host "Node.js (npm) was not found." -ForegroundColor Red
    Write-Host "Install the LTS version from https://nodejs.org, then close and reopen the terminal and run this script again."
    exit 1
}
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "Frontend dependencies are missing. Run:  cd frontend; npm install; cd .." -ForegroundColor Red
    exit 1
}

Write-Host "Starting LLM Council..."
Write-Host ""

Write-Host "Starting backend on http://127.0.0.1:8001..."
$backend = Start-Process -FilePath $uv.Source -ArgumentList "run", "python", "-m", "backend.main" -PassThru -NoNewWindow

Start-Sleep -Seconds 2

Write-Host "Starting frontend on http://localhost:5173..."
try {
    $frontend = Start-Process -FilePath $npm.Source -ArgumentList "run", "dev" -WorkingDirectory "frontend" -PassThru -NoNewWindow
} catch {
    Write-Host "Could not start the frontend: $_" -ForegroundColor Red
    Stop-Process -Id $backend.Id -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""
Write-Host "LLM Council is running!"
Write-Host "  Backend:  http://127.0.0.1:8001"
Write-Host "  Frontend: http://localhost:5173"
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers"

try {
    Wait-Process -Id $backend.Id, $frontend.Id
} finally {
    Stop-Process -Id $backend.Id, $frontend.Id -ErrorAction SilentlyContinue
}
