# Deploy automático: loja + gerenciador

Este diretório contém os arquivos para publicação automática dos dois módulos:

- `lojapf.shop` -> container `loja-virtual`
- `gerlojapf.shop` -> container `gerenciador-loja-virtual`

## Pré-requisitos

1. DNS já apontando para `177.153.62.107`:
   - `lojapf.shop` e `www.lojapf.shop`
   - `gerlojapf.shop` e `www.gerlojapf.shop`
2. Docker + Docker Compose instalados na VPS.
3. Secrets no GitHub:
   - `VPS_SSH_KEY` (chave privada para acesso ao host)
   - `GHCR_TOKEN` (PAT com `read:packages` para pull de imagens)
   - `CADDY_EMAIL` (email para emissão/renovação TLS com Let's Encrypt)

## Como funciona

O workflow `.github/workflows/deploy-lojas.yml`:

1. Faz build das imagens dos dois módulos.
2. Publica no GHCR com tag `latest` e `${GITHUB_SHA}`.
3. Sincroniza os arquivos desse diretório com `/opt/lojas` na VPS.
4. Faz `docker login` no GHCR na VPS.
5. Executa `docker compose -f docker-compose.public.yml pull && up -d`.

## Ajustes necessários

- Troque os caminhos `apps/loja-virtual` e `apps/gerenciador-loja-virtual` no workflow caso seus Dockerfiles estejam em outra pasta.
- Se as aplicações não escutarem na porta `3000`, ajuste `reverse_proxy` no `Caddyfile` e o `expose` no `docker-compose.public.yml`.
