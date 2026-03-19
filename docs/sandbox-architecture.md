# Sandbox orchestration flow

O fluxo de automação agora centraliza a execução das correções no `sandbox-orchestrator`, mantendo o backend livre de chamadas diretas à OpenAI.

1. **Frontend → Backend**
   - O usuário descreve a tarefa para um repositório (ex.: investigar falha de pipeline, corrigir testes) e informa o run/branch relevante.
   - O frontend envia a requisição para o backend (`POST /api/cifix/jobs`), incluindo dados do repositório, branch/commit e comandos de teste opcionais.

2. **Backend → Sandbox-orchestrator**
   - O backend resolve metadados do repositório e cria um registro de job (tabela `cifix_jobs`).
   - Em seguida envia o payload para o sandbox-orchestrator (`POST /jobs`) com `jobId`, `repoUrl`, `branch`, `task` e `testCommand`.
   - Consultas posteriores usam `GET /jobs/{id}` com `refresh=true` para sincronizar status e resultados.

3. **Sandbox-orchestrator → Sandbox**
   - Para cada job é criado um diretório temporário exclusivo e o repositório é clonado na branch/commit solicitado.
   - O serviço expõe tools controladas ao modelo (`run_shell`, `read_file`, `write_file`) e dispara o loop de tool-calling no modelo `gpt-5-codex` via Responses API.
   - Cada tool call é executada no sandbox (execução de comandos, leitura/escrita de arquivos) e o resultado é retornado ao modelo até o término da iteração.

4. **Sandbox-orchestrator → Backend**
   - Ao finalizar, o orquestrador registra no job: status (`COMPLETED`/`FAILED`), resumo textual, arquivos alterados e patch unificado.
   - O backend sincroniza esses dados no registro interno (`/api/cifix/jobs/{id}?refresh=true`) e os expõe ao frontend.

5. **Backend → Frontend**
   - O frontend exibe o status do job, resumo gerado e lista de arquivos modificados; quando disponível, pode apresentar o patch proposto.

## Endpoints relevantes

- **Backend**
  - `POST /api/cifix/jobs`: cria um job de análise/correção para um repositório.
  - `GET /api/cifix/jobs/{jobId}`: retorna o status salvo; use `?refresh=true` para consultar o sandbox-orchestrator.

- **Sandbox-orchestrator**
  - `POST /jobs`: inicia um job no sandbox (clona repo, prepara tools e inicia o loop com o modelo).
  - `GET /jobs/{id}`: retorna o status atual, resumo e patch quando disponíveis.

## Ferramentas disponíveis no sandbox

- O contêiner do sandbox agora inclui o utilitário `apply_patch` (wrapper para `patch`/`gpatch`) em `/usr/local/bin`. Ele aceita patches com o marcador `*** Begin Patch` ou diffs tradicionais, permitindo edições segmentadas sem reescrever arquivos completos.
- O Docker CLI vem pré-instalado para permitir workflows que dependem de contêineres; basta expor o socket do host ou usar uma engine acessível via rede.
