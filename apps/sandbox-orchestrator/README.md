# Sandbox Orchestrator

Serviço responsável por receber jobs do backend do AI Hub, preparar um sandbox temporário (clone do repositório) e orquestrar o loop de tool-calling com o modelo `gpt-5-codex` via Responses API.

## Scripts disponíveis

- `npm start`: inicia o servidor em modo de produção.
- `npm run dev`: inicia o servidor com `node --watch` (hot reload simples).
- `npm test`: executa a suíte de testes baseada em `node:test`.

### Endpoints

- `POST /jobs`: cria um job informando `jobId`, `repoUrl` ou `repoSlug`, `branch`, `taskDescription` e (opcionalmente) `testCommand`/`commit`. O serviço clona o repositório em um diretório temporário, expõe as tools `run_shell`, `read_file`, `write_file` e `http_get` ao modelo e inicia o loop de tool-calling. A tool `http_get` permite consultas HTTP públicas, bloqueando hosts locais/privados e truncando respostas grandes.
  Quando um `testCommand` é enviado, ele é executado automaticamente no final do job; se o comando retornar erro ou expirar, o job é marcado como `FAILED` e o patch não é enviado para PR.
- `GET /jobs/{id}`: retorna o status atualizado do job (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`), além de `logs`, resumo, arquivos alterados e patch gerado (`git diff`).

Jobs ficam armazenados em memória enquanto executam e são atualizados de forma assíncrona pelo `SandboxJobProcessor`.

## Variáveis de ambiente

| Variável | Descrição | Padrão |
| --- | --- | --- |
| `PORT` | Porta HTTP exposta pelo serviço | `8083` |
| `SANDBOX_SLUG_PREFIX` | Prefixo aplicado antes do slug original | *(vazio)* |
| `SANDBOX_SLUG_SUFFIX` | Sufixo aplicado após o slug original | `-sandbox` |
| `SANDBOX_IMAGE` | Imagem base utilizada para provisionar o contêiner/VM efêmero | `ghcr.io/ai-hub/sandbox:latest` |
| `SANDBOX_TTL_SECONDS` | Tempo de vida do sandbox antes de ser reciclado | `86400` |
| `SANDBOX_CPU_LIMIT` | Limite de CPU aplicado à sandbox provisionada | `1` |
| `SANDBOX_MEMORY_LIMIT` | Limite de memória aplicado à sandbox provisionada | `512m` |
| `SANDBOX_WORKDIR` | Diretório base no host onde os workspaces e clones são criados | diretório temporário do sistema |
| `SANDBOX_HOST` | Host exposto para alcançar o sandbox | `127.0.0.1` |
| `SANDBOX_BASE_PORT` | Porta base usada para simular a atribuição incremental de portas | `3000` |
| `RUN_SHELL_TIMEOUT_MS` | Tempo máximo (ms) para cada chamada `run_shell` antes de encerrar o processo | `300000` |
| `HTTP_TOOL_TIMEOUT_MS` | Timeout (ms) para chamadas `http_get` | `15000` |
| `HTTP_TOOL_MAX_RESPONSE_CHARS` | Máximo de caracteres retornados pelo corpo de `http_get` antes de truncar | `20000` |
| `PR_CREATE_RETRY_ATTEMPTS` | Número máximo de tentativas para abrir um PR antes de desistir | `3` |
| `PR_CREATE_RETRY_DELAY_MS` | Tempo base (ms) aguardado entre tentativas consecutivas de criação de PR | `1500` |
| `GITHUB_CLONE_TOKEN` | Token utilizado para todas as operações no GitHub (clone, push e criação de PR). Se ausente, o serviço tenta `GITHUB_TOKEN`, `GITHUB_PR_TOKEN` ou um token embutido em `repoUrl`. | *(vazio)* |
| `GITHUB_CLONE_USERNAME` | Usuário usado na URL autenticada (aplicado apenas se o token estiver presente) | `x-access-token` |
| `GITHUB_PR_TOKEN` | (Opcional) Fallback para `GITHUB_CLONE_TOKEN`/`GITHUB_TOKEN`; o token escolhido é reutilizado em todas as operações no GitHub. | *(vazio)* |

## Docker

O Dockerfile publicado pela pipeline gera uma imagem enxuta baseada em `node:20-alpine`. Para executar localmente:

```bash
docker build -t sandbox-orchestrator apps/sandbox-orchestrator
docker run --rm -p 8083:8083 sandbox-orchestrator
```

Com Docker Compose (na raiz do monorepo) o serviço é iniciado automaticamente com o backend e frontend.
