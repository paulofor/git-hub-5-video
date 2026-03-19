# Sandbox orchestration flow

A integração com o GPT-5-Codex agora segue o fluxo **Frontend → Backend → Sandbox Orchestrator → OpenAI → Sandbox → Backend → Frontend**. O backend apenas cria e consulta jobs persistidos e nunca envia tokens sensíveis diretamente para o modelo.

## Backend (Spring Boot)
- As solicitações de correção são representadas por registros `CiFixJobRecord` e expostas via `CiFixJobController` (`/api/cifix/jobs`).
- `CiFixJobService` cria um job persistido com status `PENDING` e, em seguida, chama o `SandboxOrchestratorClient` para criar o job correspondente no serviço `sandbox-orchestrator`.
- O método `refreshFromOrchestrator` consulta o orquestrador e atualiza o job local com `status`, `summary`, `changedFiles` e `patch` retornados.
- Nenhuma classe do backend carrega `OPENAI_API_KEY` ou chama a Responses API diretamente; toda interação com o modelo acontece dentro do orquestrador.

## Sandbox Orchestrator (Node/TypeScript)
- Endpoints principais:
  - `POST /jobs`: recebe `jobId`, `repoUrl` ou `repoSlug`, `branch`, `taskDescription`, `commit` opcional e `testCommand` opcional. Cria um sandbox temporário e dispara o processamento assíncrono.
  - `GET /jobs/{id}`: retorna o status (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`), `logs`, `summary`, `changedFiles` e `patch` produzidos no sandbox.
- Para cada job:
  - Caso um `testCommand` seja fornecido, ele é executado automaticamente após o diff ser gerado. Qualquer falha (exit code diferente de 0, sinal ou timeout) marca o job como `FAILED` e impede a criação de PR.
  1. Cria um diretório isolado e clona o repositório alvo.
  2. Inicia um loop com a Responses API (`gpt-5-codex`), fornecendo tools seguras limitadas ao sandbox:
     - `run_shell(command: string[], cwd?: string)`
     - `read_file(path: string)`
     - `write_file(path: string, content: string)`
  3. Executa os `tool_calls` retornados pelo modelo, envia `tool_outputs` e repete até não restarem chamadas.
  4. Gera um diff unificado (`git diff`) e consolida `summary`, `changedFiles`, `patch` e `logs` antes de limpar o sandbox.
- As tools validam caminhos para impedir acesso fora do diretório clonado e não repassam tokens externos para o modelo.

## Consumindo o fluxo
1. O frontend chama `POST /api/cifix/jobs` informando `projectId`, descrição da tarefa e parâmetros de branch/commit/teste.
2. O backend cria o job, encaminha para o `sandbox-orchestrator` e devolve o `jobId`.
3. O frontend consulta `GET /api/cifix/jobs/{jobId}?refresh=true` para acompanhar o status e ler `summary`, `changedFiles` e `patch` gerados pelo sandbox.
