# LLM Council - Start script for Windows (PowerShell)
# Usage:  powershell -ExecutionPolicy Bypass -File .\start.ps1

Write-Host "Starting LLM Council..."
Write-Host ""

Write-Host "Starting backend on http://127.0.0.1:8001..."
$backend = Start-Process -FilePath "uv" -ArgumentList "run", "python", "-m", "backend.main" -PassThru -NoNewWindow

Start-Sleep -Seconds 2

Write-Host "Starting frontend on http://localhost:5173..."
$frontend = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory "frontend" -PassThru -NoNewWindow

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
