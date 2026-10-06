# LLM Council (fork com Codex CLI)

![llmcouncil](header.jpg)

Fork do [karpathy/llm-council](https://github.com/karpathy/llm-council). A ideia continua a mesma: em vez de perguntar a um único modelo, você leva a pergunta a um "conselho" de LLMs.

1. **Etapa 1:** cada modelo responde sozinho.
2. **Etapa 2:** os modelos avaliam e ranqueiam as respostas uns dos outros, às cegas (as respostas viram "Response A, B, C…").
3. **Etapa 3:** um modelo presidente lê tudo e redige a resposta final.

## O que muda neste fork

### Roda com o Codex CLI, sem chave de API

O original usa a OpenRouter, que exige `OPENROUTER_API_KEY` e créditos. Aqui o padrão é o [Codex CLI](https://github.com/openai/codex) instalado na sua máquina, usando o login da sua conta ChatGPT.

- Novo cliente em `backend/codex_client.py`, com a mesma interface do `openrouter.py` (`query_model` e `query_models_parallel`). Cada consulta roda `codex exec` em modo somente leitura e sem salvar sessão.
- `backend/config.py` ganhou `LLM_PROVIDER` (`codex` por padrão) e `CODEX_BIN`.
- O modelo que gera títulos de conversa saiu do código fixo e virou `TITLE_MODEL` na config.

Modelos padrão com o Codex:

| Papel      | Modelos                                                   |
|------------|-----------------------------------------------------------|
| Conselho   | `gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6-terra`, `gpt-5.5`  |
| Presidente | `gpt-6.1-sol`                                             |
| Títulos    | `gpt-6-luna`                                              |

Limitações:
- O Codex só oferece modelos da OpenAI disponíveis no seu plano. Gemini, Claude e Grok ficam de fora.
- Cada consulta abre um processo `codex`, então é mais lento que a API. O tempo limite por consulta é de 300s.
- O uso conta no limite do seu plano ChatGPT.

Para voltar à OpenRouter, coloque no `.env`:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
```

### Câmara do conselho: escolha quem senta à mesa

Em **Configurar conselho**, o conselho aparece como uma mesa redonda: o presidente com coroa no topo e cada conselheiro numa cadeira, na cor do seu papel. Clicando numa cadeira, você vê e muda:

- **Onde roda:** Codex CLI, Claude Code ou Antigravity (o app detecta quais estão instalados e lista os modelos de cada um).
- **Modelo:** escolhido numa lista com busca, e **Testar conexão** mostra se o modelo responde e em quanto tempo.
- **Papel no conselho:** muda o ângulo da resposta na etapa 1. A avaliação da etapa 2 continua neutra e às cegas.

| Papel | O que faz |
|---|---|
| Generalista | Responde direto, sem um ângulo específico |
| Contrário | Questiona premissas, procura riscos e cenários de falha |
| Primeiros princípios | Decompõe o problema até os fundamentos |
| Expansionista | Procura oportunidades e ideias ambiciosas |
| Olhar de fora | Traz outras áreas, casos análogos e comparações |
| Executor | Transforma a resposta em passos, metas e riscos |

Também dá para adicionar cadeiras, tirar alguém de uma sessão sem apagar a cadeira, tornar um conselheiro presidente e misturar provedores: por exemplo, GPT pelo Codex, Claude Sonnet pelo Claude Code e Gemini 3.1 Pro pelo Antigravity, com o Claude Opus presidindo. A configuração fica em `data/council.json`. Na etapa 1, cada aba mostra em que papel o modelo respondeu.

Requisitos: o `claude` (Claude Code) e o `agy` (Antigravity) precisam estar instalados e logados. Os dois rodam sem permissão de editar arquivos.

### Vários conselhos salvos

Você pode montar e guardar vários conselhos, por exemplo um de **Produto** (PM, CEO e Voz do cliente), um de **Código** (Engenheiro sênior, Segurança e CTO) e um **rápido** com um só modelo leve. Cada um tem as suas cadeiras, papéis, skills e presidente.

- Na câmara, as abas no topo trocam de conselho. **+ Novo conselho** cria um copiando o atual ou começando do zero. O nome e a descrição são editáveis ali mesmo, e há **Usar como padrão** e **Apagar conselho**.
- No campo de pergunta, o seletor ao lado do **+** escolhe qual conselho responde aquela pergunta. Ele começa no conselho padrão.
- A pergunta salva mostra a qual conselho ela foi feita ("Perguntado a: Produto").

Os conselhos ficam em `data/councils.json`. Na primeira vez, o conselho que você já tinha vira o "Conselho principal".

### Skills: especialidades para os conselheiros

Na câmara, o botão **Biblioteca de skills** abre um catálogo de especialidades que você instala e depois dá a qualquer cadeira, inclusive ao presidente. Por exemplo: o Gemini como Contrário **com** as skills de PM e CEO.

As skills vêm só de duas fontes confiáveis:
- **Biblioteca do LLM Council:** 12 skills escritas neste projeto: Gerente de produto, CEO, CTO, CFO, Designer de UX, Marketing e crescimento, Segurança, Jurídico e compliance, Investidor, Cientista de dados, Engenheiro sênior e Voz do cliente.
- **Do seu computador:** os `SKILL.md` que você já instalou para o Claude Code, o Codex e plugins (`~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills` e o cache de plugins do Claude). São lidos do disco, nunca baixados da internet.

Na etapa 1, as skills da cadeira entram como instruções extras junto com o papel. A avaliação às cegas da etapa 2 continua neutra. As skills do presidente valem na síntese final. A biblioteca instalada fica em `data/skills.json`.

### Perguntas sobre os seus projetos

Você pode cadastrar a pasta de um projeto e abrir vários chats dentro dele. Nesses chats, cada modelo do conselho lê os arquivos do projeto antes de responder.

- Na barra lateral, em **Projetos → Adicionar**, digite o caminho da pasta ou use **Escolher…**, que abre o seletor de pastas do macOS.
- Os chats ficam agrupados por projeto. O **+** ao lado do nome abre um chat novo naquele projeto.
- Nas três etapas, o Codex roda dentro da pasta do projeto (`-C <pasta>`) em modo **somente leitura**, então nada no projeto é alterado.
- Explorar código leva mais tempo: o limite por consulta sobe para 15 minutos nesses chats.
- Remover um projeto apaga os chats dele no LLM Council, mas não mexe na pasta do projeto.
- **Perguntas gerais**, fora de projetos, continuam funcionando como antes.

Os projetos ficam em `data/projects.json`, e cada conversa guarda o seu `project_id`. Isso funciona só com `LLM_PROVIDER=codex`, porque a OpenRouter não tem acesso a arquivos.

### Anexos: imagens, vídeos, pastas e links

O botão **+** no campo de pergunta abre o menu de anexos. Também dá para arrastar arquivos para o campo ou colar uma imagem.

- **Imagem:** vai direto para os modelos (`codex exec --image`).
- **Vídeo:** o Codex não lê vídeo, então o backend extrai 6 quadros em intervalos iguais com `ffmpeg` e envia como imagens, explicando que são quadros em ordem. Requer `ffmpeg` instalado.
- **Pasta:** os modelos recebem o caminho e podem ler os arquivos em modo somente leitura. O botão **Escolher…** abre o seletor do macOS.
- **Link:** o backend baixa a página, extrai o texto (até 20 mil caracteres) e o junta à pergunta.

Os anexos valem para as três etapas, assim quem avalia vê o mesmo material de quem respondeu. Os arquivos enviados ficam em `data/uploads/`, e a pergunta salva mostra os anexos usados.

### Novo design

![Tela do app com uma pergunta respondida pelo conselho](docs/screenshot.png)

![Resposta final do presidente](docs/screenshot-resposta.png)

A interface foi redesenhada com o tema de uma sessão de conselho:

- Barra lateral azul-marinho, com um logo de cinco assentos em semicírculo.
- A pergunta aparece em destaque, em serifa (Newsreader). A interface usa Instrument Sans.
- As três etapas viram uma linha do tempo numerada.
- As abas dos modelos viraram um seletor segmentado.
- A classificação geral aparece como barras e vem antes das avaliações individuais. Ela fica salva no histórico, então aparece também ao reabrir conversas antigas.
- A resposta final do presidente fica num cartão dourado, o único destaque forte da página.
- Foco visível pelo teclado, respeito a quem prefere menos animação e layout em uma coluna em telas estreitas.
- Os estilos estão concentrados em `frontend/src/index.css`, com tokens de cor no `:root`.

### Interface em português e inglês

A interface está em português (pt-BR) e inglês. O botão **EN / PT** ao lado do nome do app troca o idioma na hora, e a escolha fica salva no navegador. Na primeira visita, o idioma segue o do navegador. Os textos ficam em `frontend/src/i18n.jsx`.

## Sistemas operacionais

Funciona em **macOS**, **Linux** e **Windows**.

| | macOS | Linux | Windows |
|---|---|---|---|
| Iniciar | `./start.sh` | `./start.sh` | `.\start.ps1` (PowerShell) |
| Botão "Escolher…" de pasta | Nativo | `zenity` ou `kdialog` (senão, digite o caminho) | Nativo |
| Anexar vídeos | Requer `ffmpeg` | Requer `ffmpeg` | Requer `ffmpeg` no PATH |

- Os programas de IA (`codex`, `claude`, `agy`) são encontrados pelo PATH, inclusive os `.cmd` que o npm instala no Windows.
- Perguntas longas para o Antigravity vão por um arquivo temporário, porque ele só aceita a pergunta como argumento e o Windows limita o tamanho do comando.
- Os arquivos de dados são lidos e gravados em UTF-8 em todos os sistemas.
- Por segurança, o backend escuta só em `127.0.0.1`: ele usa os seus logins de IA e pode ler pastas locais, então não deve ficar acessível na rede. Para mudar, defina `LLM_COUNCIL_HOST`.

No Windows, se o PowerShell bloquear o script, rode `powershell -ExecutionPolicy Bypass -File .\start.ps1`.

## Como rodar

Pré-requisitos: [uv](https://docs.astral.sh/uv/), Node.js e o Codex CLI instalado e logado (`codex login`).

```bash
uv sync
cd frontend && npm install && cd ..
./start.sh
```

Depois abra http://localhost:5173.

Ou rode separado:

```bash
uv run python -m backend.main
```

```bash
cd frontend && npm run dev
```

## Stack

- **Backend:** FastAPI (Python 3.10+), Codex CLI ou OpenRouter via httpx
- **Frontend:** React + Vite, react-markdown
- **Armazenamento:** arquivos JSON em `data/conversations/`

## Créditos

Projeto original de [Andrej Karpathy](https://github.com/karpathy/llm-council), que o descreve como um hack de fim de semana sem suporte. Este fork mantém esse espírito.
