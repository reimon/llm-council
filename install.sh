#!/usr/bin/env bash
# LLM Council - one-step installer for macOS and Linux
#
#   curl -fsSL https://raw.githubusercontent.com/reimon/llm-council/master/install.sh | bash
# or, inside an existing llm-council folder:
#   ./install.sh
#
# Installs what is missing (Git, Node.js, uv), downloads/updates the project, installs its
# dependencies, offers to install and log in to the AI apps, then starts the app.

set -e
REPO_URL="https://github.com/reimon/llm-council.git"

say()  { printf '%s\n' "$1"; }
step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
has()  { command -v "$1" >/dev/null 2>&1; }
ask()  { read -r -p "$1 [S/n] " a </dev/tty; [[ -z "$a" || "$a" =~ ^([sSyY]|sim|yes)$ ]]; }

pkg_install() {  # $1 = brew name, $2 = apt name
  if has brew; then brew install "$1"
  elif has apt-get; then sudo apt-get update -y && sudo apt-get install -y "$2"
  elif has dnf; then sudo dnf install -y "$2"
  else say "Instale $1 manualmente e rode este instalador de novo."; exit 1
  fi
}

say "LLM Council - instalador para macOS e Linux"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

step "1/5 Ferramentas básicas"
if has git; then say "Git: ok"; else
  if [[ "$(uname)" == "Darwin" ]] && ! has brew; then xcode-select --install || true; say "Conclua a instalação das ferramentas do Xcode e rode de novo."; exit 1; fi
  pkg_install git git
fi
if has npm; then say "Node.js/npm: ok"; else pkg_install node nodejs; fi
if has uv; then say "uv: ok"; else curl -LsSf https://astral.sh/uv/install.sh | sh; export PATH="$HOME/.local/bin:$PATH"; fi
for t in git npm uv; do has "$t" || { say "$t ainda não aparece. Abra um novo terminal e rode de novo."; exit 1; }; done

step "2/5 Baixando o LLM Council"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || pwd)"
if [[ -f "$HERE/backend/main.py" ]]; then ROOT="$HERE"; cd "$ROOT"; git pull --ff-only || true
elif [[ -f "$PWD/backend/main.py" ]]; then ROOT="$PWD"; git pull --ff-only || true
else
  ROOT="$HOME/llm-council"
  if [[ -f "$ROOT/backend/main.py" ]]; then cd "$ROOT"; git pull --ff-only || true
  else git clone "$REPO_URL" "$ROOT"; cd "$ROOT"; fi
fi
say "Pasta: $ROOT"

step "3/5 Instalando as dependências"
uv sync
(cd frontend && npm install)

step "4/5 Programas de IA (você precisa de pelo menos um)"
install_app() {  # $1 name, $2 command, $3 npm package, $4 login command
  if has "$2"; then say "$1: já instalado"; return; fi
  if ask "Instalar $1?"; then
    npm install -g "$3" || sudo npm install -g "$3"
    if has "$2"; then say "Agora faça o login (no Claude Code, saia com Ctrl+C duas vezes)."; $4 </dev/tty || true; fi
  fi
}
install_app "Codex (GPT, conta do ChatGPT)" codex @openai/codex "codex login"
install_app "Claude Code (Claude, conta da Anthropic)" claude @anthropic-ai/claude-code "claude"
has agy || say "Para usar Gemini: instale o app Antigravity (https://antigravity.google) e faça login."

step "Configurando o conselho com os programas de IA encontrados"
uv run python -m backend.autoconfig || true

step "5/5 Iniciando o app"
say "Abra http://localhost:5173 no navegador. Para usar outro dia: cd $ROOT && ./start.sh"
exec ./start.sh
