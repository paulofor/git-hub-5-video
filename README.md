# AI Hub

AI Hub é um monorepo full-stack que centraliza a criação e governança de sistemas a partir de blueprints controlados exclusivamente via interface web. O projeto combina um backend Spring Boot com um frontend React/Vite, infraestrutura pronta para Docker e AWS Lightsail, além de automações GitHub Actions.

## Visão geral

- **UI-first**: nenhuma ação destrutiva é executada sem confirmação explícita na UI.
- **Integrações GitHub**: criação de repositórios, disparo de workflows, análise de logs, comentários e PRs de correção.
- **OpenAI Responses API**: integração mediada pelo sandbox-orchestrator para gerar correções e relatórios `CiFix` a partir de falhas em pipelines.
- **Persistência**: MySQL 5.7 (produção) com Flyway para auditoria, blueprints, prompts e respostas.
- **Módulo de projetos descontinuado**: fluxos de criação, catálogo e detalhes de projetos foram removidos para abrir espaço para a próxima geração de experiências.

## Estrutura de pastas

```
apps/
  backend/
  frontend/
  sandbox-orchestrator/
infra/
  nginx/
  lightsail/
.github/
  workflows/
```

## Desenvolvimento local

1. Ajuste as variáveis em `.env` na raiz (já versionado com valores padrão compatíveis com a VPS) e, se necessário, personalize também `apps/backend/.env.example` e `apps/frontend/.env.example`. O campo `DB_PASS` já está configurado com a senha atual (`S3nh@Fort3!`); se a senha for rotacionada, atualize o valor nesses arquivos antes de reiniciar os contêineres.
2. Garanta que você tenha um MySQL acessível (pode reutilizar o mesmo da produção ou apontar para outro ambiente) e então execute `docker-compose up --build` para subir backend, frontend e sandbox-orchestrator.
3. Instale o Maven localmente para executar comandos do backend (`mvn test`, `mvn clean package`). A imagem do sandbox já vem com Maven, JDK e Docker CLI pré-instalados; se precisar configurar a sua máquina, siga [este passo a passo](docs/maven-setup.md).
4. A UI estará disponível em `http://localhost:8082`, a API em `http://localhost:8081` e o sandbox-orchestrator em `http://localhost:8083`.

### Armazenamento do token da OpenAI na VPS

- Para guardar o token da OpenAI em um arquivo físico na VPS, use o caminho `/root/infra/openai-token/openai_api_key` (já esperado pelos contêineres por padrão). Esse diretório é montado como volume somente leitura no `sandbox-orchestrator` e, se o arquivo existir, o conteúdo é exportado como `OPENAI_API_KEY` antes de iniciar o serviço.
- Caso prefira armazenar o arquivo em outro diretório, defina `OPENAI_TOKEN_HOST_DIR` no `.env` apontando para a pasta que contém o `openai_api_key` antes de executar `docker-compose up`.
- Caso o arquivo não esteja presente, o comportamento permanece igual ao anterior: as variáveis de ambiente definidas em `.env` continuam sendo usadas.

## Testes

- Backend: `mvn -f apps/backend test`
- Frontend: `npm --prefix apps/frontend run lint`
- Sandbox Orchestrator: `npm --prefix apps/sandbox-orchestrator test`

### Expondo o frontend via HTTP

Para disponibilizar a interface web publicamente (sem TLS, usando apenas HTTP) ajuste o arquivo `.env` e recrie os contêineres:

1. Defina `FRONTEND_HTTP_PORT=80` (ou outra porta pública exposta).
2. Configure `HUB_ALLOWED_ORIGINS` com a origem pública do frontend (ex.: `http://seu.dominio.com`).
3. Mantenha `VITE_API_BASE_URL=/api` — o nginx do container do frontend roteia as chamadas para o serviço `backend`.
4. Ajuste `HUB_CORS_ALLOW_CREDENTIALS` para `true` apenas se precisar encaminhar cookies/autenticação cruzada.

> No AWS Lightsail, replique esses valores em `infra/lightsail/containers.example.json` (`HUB_ALLOWED_ORIGINS` e `VITE_API_BASE_URL=/api`) antes de publicar o serviço.

## Deploy em produção

- As imagens publicadas na pipeline ficam disponíveis em `ghcr.io/<seu-usuário>/ai-hub-3-backend`, `ghcr.io/<seu-usuário>/ai-hub-3-frontend` e `ghcr.io/<seu-usuário>/ai-hub-3-sandbox`.
- Para que o deploy automático funcione, crie os secrets `GHCR_USERNAME` e `GHCR_TOKEN` (um PAT com escopo `read:packages`) no repositório — eles serão usados para executar `docker login` na VPS antes de `docker compose pull`.
- Utilize o exemplo `infra/lightsail/containers.example.json` para provisionar o serviço no AWS Lightsail Container Service.
- Em uma VPS genérica (como Locaweb), execute `sudo ./infra/setup_vps.sh` para instalar dependências, gerar `.env` com as credenciais do MySQL 5.7 hospedado em `d555d.vps-kinghost.net` e subir os contêineres via Docker Compose.

## CI/CD

O workflow `ci.yml` executa testes do backend, lint do frontend e validação de Dockerfiles a cada push ou pull request.

## Licença

MIT
