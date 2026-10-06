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

### Perguntas sobre os seus projetos

Você pode cadastrar a pasta de um projeto e abrir vários chats dentro dele. Nesses chats, cada modelo do conselho lê os arquivos do projeto antes de responder.

- Na barra lateral, em **Projetos → Adicionar**, digite o caminho da pasta ou use **Escolher…**, que abre o seletor de pastas do macOS.
- Os chats ficam agrupados por projeto. O **+** ao lado do nome abre um chat novo naquele projeto.
- Nas três etapas, o Codex roda dentro da pasta do projeto (`-C <pasta>`) em modo **somente leitura**, então nada no projeto é alterado.
- Explorar código leva mais tempo: o limite por consulta sobe para 15 minutos nesses chats.
- Remover um projeto apaga os chats dele no LLM Council, mas não mexe na pasta do projeto.
- **Perguntas gerais**, fora de projetos, continuam funcionando como antes.

Os projetos ficam em `data/projects.json`, e cada conversa guarda o seu `project_id`. Isso funciona só com `LLM_PROVIDER=codex`, porque a OpenRouter não tem acesso a arquivos.

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

### Interface em português

Todos os textos da interface foram traduzidos para português (pt-BR), incluindo o título padrão de conversas novas ("Nova conversa").

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
