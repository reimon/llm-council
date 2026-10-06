# LLM Council - one-step installer for Windows
#
# Run in PowerShell or the Command Prompt:
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/reimon/llm-council/master/install.ps1 | iex"
# or, inside an existing llm-council folder:
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#
# It installs what is missing (Git, Node.js, uv), downloads/updates the project,
# installs its dependencies, offers to install and log in to the AI apps, then starts the app.

# "Continue": in Windows PowerShell 5, "Stop" turns any stderr output of git/npm (progress
# messages) into a fatal error. Native commands are checked with $LASTEXITCODE instead.
$ErrorActionPreference = "Continue"

function Check($what) {
    if ($LASTEXITCODE -ne 0) {
        Say "Falha em: $what (codigo $LASTEXITCODE). Veja a mensagem acima." "Red"
        exit 1
    }
}
$RepoUrl = "https://github.com/reimon/llm-council.git"

function Say($text, $color = "White") { Write-Host $text -ForegroundColor $color }
function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }

# Windows only sees newly installed programs in new terminals; reload PATH in this one instead.
function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machine;$user;$env:APPDATA\npm;$env:USERPROFILE\.local\bin"
}

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Ask($question) {
    $answer = Read-Host "$question [S/n]"
    return ($answer -eq "" -or $answer -match "^(s|y|sim|yes)$")
}

function Install-WithWinget($id, $name) {
    if (-not (Has "winget")) {
        Say "O winget nao esta disponivel neste Windows. Instale $name manualmente e rode este instalador de novo." "Red"
        exit 1
    }
    Say "Instalando $name (pode pedir permissao do Windows; clique em Sim)..."
    winget install --id $id -e --accept-source-agreements --accept-package-agreements --silent
    Refresh-Path
}

Say "LLM Council - instalador para Windows" "Green"
Refresh-Path

# 1. Base tools
Step "1/5 Ferramentas basicas"
if (Has "git") { Say "Git: ok" } else { Install-WithWinget "Git.Git" "Git" }
if (Has "npm") { Say "Node.js/npm: ok" } else { Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js" }
if (Has "uv") { Say "uv: ok" } else { Install-WithWinget "astral-sh.uv" "uv" }

foreach ($tool in "git", "npm", "uv") {
    if (-not (Has $tool)) {
        Say "$tool foi instalado mas ainda nao aparece. Feche este terminal, abra outro e rode o instalador de novo." "Red"
        exit 1
    }
}

# 2. Project folder: use the current one if we are inside the repo, else clone to the user folder
Step "2/5 Baixando o LLM Council"
$here = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
if (Test-Path (Join-Path $here "backend\main.py")) {
    $Root = $here
    Set-Location $Root
    Say "Usando a pasta $Root"
    git pull --ff-only
} else {
    $Root = Join-Path $env:USERPROFILE "llm-council"
    if (Test-Path (Join-Path $Root "backend\main.py")) {
        Set-Location $Root
        Say "Atualizando $Root"
        git pull --ff-only
    } else {
        git clone $RepoUrl $Root
        Check "git clone"
        Set-Location $Root
    }
}

# 3. Dependencies
Step "3/5 Instalando as dependencias (a primeira vez demora alguns minutos)"
uv sync
Check "uv sync"
Push-Location frontend
npm install
Check "npm install"
Pop-Location

# 4. AI apps
Step "4/5 Programas de IA (voce precisa de pelo menos um)"
$apps = @(
    @{ Name = "Codex (GPT, usa a conta do ChatGPT)"; Cmd = "codex"; Pkg = "@openai/codex"; Login = "codex login" },
    @{ Name = "Claude Code (Claude, usa a conta da Anthropic)"; Cmd = "claude"; Pkg = "@anthropic-ai/claude-code"; Login = "claude" }
)
foreach ($app in $apps) {
    if (Has $app.Cmd) {
        Say "$($app.Name): ja instalado"
        continue
    }
    if (Ask "Instalar $($app.Name)?") {
        npm install -g $app.Pkg
        Refresh-Path
        if (Has $app.Cmd) {
            Say "Agora faca o login. Ao terminar, volte aqui (no Claude Code, saia com Ctrl+C duas vezes)." "Yellow"
            Invoke-Expression $app.Login
        } else {
            Say "Nao consegui instalar $($app.Name). Tente abrir o terminal como administrador." "Red"
        }
    }
}
if (-not (Has "agy")) {
    Say "Para usar Gemini: instale o app Antigravity (https://antigravity.google), abra e faca login com a conta Google." "Yellow"
}
if (-not (Has "codex") -and -not (Has "claude") -and -not (Has "agy")) {
    Say "Nenhum programa de IA instalado ainda: o app abre, mas o conselho nao consegue responder." "Red"
}

# 5. Start
Step "5/5 Iniciando o app"
Say "Quando aparecer 'LLM Council is running!', abra http://localhost:5173 no navegador." "Green"
Say "Para usar outro dia: abra o terminal na pasta $Root e rode  powershell -ExecutionPolicy Bypass -File .\start.ps1"
& (Join-Path $Root "start.ps1")
