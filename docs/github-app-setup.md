# Criando a GitHub App para o AI Hub

Esta referência resume decisões práticas para criar uma GitHub App compatível com o `infra/setup_vps.sh` e com os fluxos do Codex (backend) que abrem PRs, leem logs de Actions e recebem webhooks.

## Nome e identidade visual

- **Sugestões de nome**: `AI Hub Automations`, `Codex Workflow Bridge`, `AI Hub DevOps Bot`, `Codex Actions Orchestrator`.
- **Slug automático**: o GitHub gera um slug com base no nome; ele pode ser usado em `GITHUB_ORG_DEFAULT` se desejar que o script pré-selecione uma organização.
- **Homepage URL**: use uma página institucional do seu time (por exemplo, o domínio público onde o AI Hub será hospedado) ou, caso ainda não exista, informe temporariamente a URL do repositório (`https://github.com/<sua-conta>/ai-hub`). O campo pode ser editado depois sem impacto técnico.

## Permissões recomendadas

A lista abaixo cobre o conjunto mínimo para os recursos padrão do AI Hub. Ajuste somente se tiver certeza de que alguma capacidade não será utilizada.

| Escopo | Nível | Motivo |
| --- | --- | --- |
| **Repository contents** | Read & write | Criar branches, commits e abrir PRs via Codex CLI/backend. |
| **Pull requests** | Read & write | Atualizar descrições, etiquetas e status dos PRs abertos pelo Codex. |
| **Issues** | Read & write | Publicar comentários ou abrir issues derivados de análises automáticas. |
| **Actions** | Read & write | Ler logs de workflows e reexecutá-los quando necessário. |
| **Workflows** | Read & write | Desencadear pipelines com entradas personalizadas. |
| **Checks** | Read & write | Publicar resultados de análises (por exemplo, relatórios CiFix). |
| **Metadata** | Read-only | Sempre obrigatório para chamadas básicas da API GitHub. |
| **Administration (webhooks)** | Read-only | Necessário para listar instalações via API de Apps. |

Se a sua instalação também precisa interagir com repositórios privados, marque a opção "**Repository access: All repositories**" ou selecione os repositórios individualmente.

## Webhooks

- Configure a **Webhook URL** com o endpoint público do backend (ex.: `https://<seu-dominio>/api/github/webhook`).
- Defina um **Webhook secret** forte e anote-o para preencher `GITHUB_WEBHOOK_SECRET` durante o script.
- Habilite no mínimo os eventos `pull_request`, `push`, `check_run`, `check_suite`, `workflow_run` e `issues`, pois são consumidos pelo backend para sincronização de estado.

> 💡 **Onde encontrar os dados na interface do GitHub**
>
> 1. Faça login no GitHub, clique na sua foto (canto superior direito) e acesse **Settings → Developer settings → GitHub Apps**.
> 2. Selecione a app recém-criada (ex.: `ai-hub-automations`). Na aba **General** você verá um banner semelhante a “Registration successful! You must generate a private key in order to install your GitHub App.” — use o botão **Generate a private key** ali mesmo para baixar o `.pem`.
> 3. A seção **About** mostra os campos **App ID** (número, ex.: `212632`) e **Client ID** (ex.: `Iv1.xxxxxxxxxxxxx`). Copie o App ID para `GITHUB_APP_ID`; o Client ID não é usado pelo script, mas é útil para integrações OAuth caso venha a precisar.
> 4. Logo abaixo, em **Webhook**, crie (ou revele) o segredo clicando em **Edit**, copie o valor para `GITHUB_WEBHOOK_SECRET` e salve.
> 5. Na coluna lateral esquerda, entre em **Install App**, abra a instalação correspondente à sua conta/organização e copie o número final da URL (`/installations/<id>`) para `GITHUB_INSTALLATION_ID`.
> 6. O mesmo painel mostra um link “**View App settings**” com a URL pública `https://github.com/settings/apps/<slug-da-app>`; se não tiver uma homepage própria, utilize essa URL como `Homepage URL` na configuração inicial.

## Chave privada (.pem)

Na seção **Private keys**, gere uma nova chave e baixe o arquivo `.pem`. Durante a execução do `infra/setup_vps.sh` você pode:

1. Informar o caminho local do arquivo (o script fará a leitura e armazenará o conteúdo no `.env` com quebras de linha escapadas),
2. Colar manualmente o conteúdo com `\n` para cada nova linha, seguindo as instruções do prompt, ou
3. Manter o arquivo `.pem` em disco e apontar para ele via `GITHUB_PRIVATE_KEY_FILE` (ou `hub.github.private-key-file` nas configurações do Spring). Se essa variável estiver presente, o backend lerá diretamente o arquivo e não exigirá que a chave esteja inline no `.env`.

## Installation ID

Após criar a app, clique em **Install App** e selecione a conta ou organização-alvo. Anote o número ao final da URL (`/installations/<id>`) para preencher `GITHUB_INSTALLATION_ID`.

## Codex CLI e abertura de PRs

O backend (apelidado de "Codex" no script) e o CLI utilizam o par `GITHUB_APP_ID` + `GITHUB_INSTALLATION_ID` juntamente com a chave privada para gerar tokens de acesso temporários na API do GitHub. Uma vez configurados, eles podem:

- Criar branches, commits e pull requests automatizados;
- Atualizar descrições, labels e reviewers;
- Ler e comentar nos logs das GitHub Actions.

Portanto, sim: com as credenciais da GitHub App corretamente configuradas, o Codex CLI consegue abrir PRs em seu nome. Basta garantir que o `.env` (tanto local quanto no servidor) contenha as mesmas variáveis utilizadas pelo backend.
