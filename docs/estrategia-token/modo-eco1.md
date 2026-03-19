# Estratégias já implementadas (e como aproveitar) para reduzir o custo dos modelos no Codex CLI

Este guia resume os principais mecanismos dentro deste repositório que ajudam a conter o uso de tokens/modelos e o que você pode fazer para se beneficiar deles. Sempre que cito código, copio o trecho correspondente porque quem lerá este documento não terá acesso ao repositório.

> Este conjunto de práticas alimenta o perfil de integração **ECO-1** no hub: ao selecionar o perfil, as orientações abaixo são adotadas automaticamente para maximizar economia de tokens.

## 1. Limite o tamanho das instruções fixas do projeto

**O que o código faz:** o carregamento de arquivos `AGENTS.md`/docs do projeto respeita `project_doc_max_bytes`. Assim que o total permitido é atingido, os arquivos restantes deixam de ser enviados ao modelo e o excesso é truncado com aviso.

Exemplo:

```rust
pub async fn read_project_docs(config: &Config) -> std::io::Result<Option<String>> {
    let max_total = config.project_doc_max_bytes;

    if max_total == 0 {
        return Ok(None);
    }
    …
        if size > remaining {
            tracing::warn!(
                "Project doc `{}` exceeds remaining budget ({} bytes) - truncating.",
                p.display(),
                remaining,
            );
        }
```

**Como aplicar:**

- Defina `project_doc_max_bytes` no arquivo de configuração (ex.: `~/.codex/config.json`) para um valor compatível com o orçamento de tokens do seu time.
- Prefira sintetizar guias curtos por projeto; mantenha múltiplos `AGENTS.md` enxutos para evitar truncamento silencioso.

## 2. Controle o tamanho dos outputs de ferramentas antes que eles entrem no histórico

**O que o código faz:** qualquer valor definido em `tool_output_token_limit` é propagado para a `truncation_policy` do modelo e usado para cortar outputs de ferramentas, funções e comandos locais antes de guardá-los no histórico compartilhado com o modelo.

Exemplo:

```rust
if let Some(token_limit) = config.tool_output_token_limit {
    model.truncation_policy = match model.truncation_policy.mode {
        TruncationMode::Bytes => {
            let byte_limit =
                i64::try_from(approx_bytes_for_tokens(token_limit)).unwrap_or(i64::MAX);
            TruncationPolicyConfig::bytes(byte_limit)
        }
        TruncationMode::Tokens => {
            let limit = i64::try_from(token_limit).unwrap_or(i64::MAX);
            TruncationPolicyConfig::tokens(limit)
        }
    };
}
```

Exemplo:

```rust
fn process_item(&self, item: &ResponseItem, policy: TruncationPolicy) -> ResponseItem {
    let policy_with_serialization_budget = policy * 1.2;
    match item {
        ResponseItem::FunctionCallOutput { call_id, output } => {
            let body = match &output.body {
                FunctionCallOutputBody::Text(content) => FunctionCallOutputBody::Text(
                    truncate_text(content, policy_with_serialization_budget),
                ),
                FunctionCallOutputBody::ContentItems(items) => {
                    FunctionCallOutputBody::ContentItems(
                        truncate_function_output_items_with_policy(
                            items,
                            policy_with_serialization_budget,
                        ),
                    )
                }
            };
            …
        }
        ResponseItem::CustomToolCallOutput { call_id, output } => {
            let truncated = truncate_text(output, policy_with_serialization_budget);
            …
        }
```

**Como aplicar:**

- Ajuste `tool_output_token_limit` para restringir outputs verbosos (por exemplo, 2 000 tokens). Ferramentas continuarão executando normalmente, mas apenas um resumo entra no contexto pago.
- Se precisar do output completo, mude o limite temporariamente ou peça para o agente salvar o resultado em arquivo local em vez do histórico do modelo.

## 3. Use (e monitore) a compaction automática do histórico

**O que o código faz:** tarefas de compaction (`codex compact` ou triggers automáticos) fazem streaming de um resumo e, caso a janela do modelo seja excedida, removem itens antigos até caber de novo antes de reexecutar o pedido.

Exemplo:

```rust
            Err(e @ CodexErr::ContextWindowExceeded) => {
                if turn_input_len > 1 {
                    // Trim from the beginning to preserve cache (prefix-based) and keep recent messages intact.
                    error!(
                        "Context window exceeded while compacting; removing oldest history item. Error: {e}"
                    );
                    history.remove_first_item();
                    truncated_count += 1;
                    retries = 0;
                    continue;
                }
                …
            }
```

**Como aplicar:**

- Acione compaction manual (`codex compact`) após longas sessões ou antes de pedir tarefas grandes.
- Monitore os avisos “Trimmed *N* older thread item(s)” no log: eles indicam que o sistema já descartou mensagens antigas para se manter dentro do orçamento.

## 4. Evite pagar tokens desnecessários por imagens inline

**O que o código faz:** quando há imagens embutidas em base64, o estimador substitui o payload bruto por um custo fixo (`IMAGE_BYTES_ESTIMATE`). Isso impede que anexos muito grandes distorçam a contagem e acionem compaction muito cedo (o que aumentaria o custo total por exigir novos resumos).

Exemplo:

```rust
const IMAGE_BYTES_ESTIMATE: i64 = 7373;

pub(crate) fn estimate_response_item_model_visible_bytes(item: &ResponseItem) -> i64 {
    …
            let (payload_bytes, image_count) = image_data_url_estimate_adjustment(item);
            if payload_bytes == 0 || image_count == 0 {
                raw
            } else {
                // Replace raw base64 payload bytes with a fixed per-image cost.
                …
                raw.saturating_sub(payload_bytes)
                    .saturating_add(image_count.saturating_mul(IMAGE_BYTES_ESTIMATE))
            }
        }
}

fn image_data_url_estimate_adjustment(item: &ResponseItem) -> (i64, i64) {
    …
        if let Some(payload_len) = base64_data_url_payload_len(image_url) {
            payload_bytes = payload_bytes.saturating_add(i64::try_from(payload_len).unwrap_or(i64::MAX));
            image_count = image_count.saturating_add(1);
        }
    …
}
```

**Como aplicar:**

- Sempre que precisar compartilhar imagens, prefira os formatos suportados (`data:image/...;base64`). O estimador já conhece esse padrão e evita cobrar o payload inteiro.
- Use imagens com resolução suficiente, mas comprimidas; isso mantém o custo fixo alinhado ao valor real que o modelo precisa processar.

## 5. Aproveite o “nudge” para modelos mais baratos

**O que o código faz:** quando o uso chega a 90 % do limite de plano, a TUI agenda um prompt para sugerir troca automática para `gpt-5.1-codex-mini`, um modelo mais barato/de menor consumo.

Exemplo:

```rust
const NUDGE_MODEL_SLUG: &str = "gpt-5.1-codex-mini";
const RATE_LIMIT_SWITCH_PROMPT_THRESHOLD: f64 = 90.0;
…
            let high_usage = is_codex_limit
                && (snapshot
                    .secondary
                    .as_ref()
                    .map(|w| w.used_percent >= RATE_LIMIT_SWITCH_PROMPT_THRESHOLD)
                    .unwrap_or(false)
                    || snapshot
                        .primary
                        .as_ref()
                        .map(|w| w.used_percent >= RATE_LIMIT_SWITCH_PROMPT_THRESHOLD)
                        .unwrap_or(false));

            if high_usage
                && !self.rate_limit_switch_prompt_hidden()
                && self.current_model() != NUDGE_MODEL_SLUG
                && !matches!(
                    self.rate_limit_switch_prompt,
                    RateLimitSwitchPromptState::Shown
                )
            {
                self.rate_limit_switch_prompt = RateLimitSwitchPromptState::Pending;
            }
```

**Como aplicar:**

- Não desative `notices.hide_rate_limit_model_nudge` a menos que tenha orçamento folgado. Aceitar o prompt troca imediatamente de modelo e evita bloqueios.
- Você também pode definir `codex --model gpt-5.1-codex-mini` manualmente para tarefas menos críticas ou quando souber que o dia terá uso intenso.

## Checklist rápido

1. **Config:** defina `project_doc_max_bytes` e `tool_output_token_limit` alinhados ao seu orçamento.
2. **Processo:** habilite/rode compaction após maratonas longas para manter o histórico curto.
3. **Anexos:** use imagens inline suportadas, comprimidas.
4. **Modelos:** responda aos nudges para `gpt-5.1-codex-mini` ou force esse modelo em tarefas triviais.

Seguindo essas práticas, você se mantém dentro dos mecanismos de economia já embutidos no cliente Codex e evita surpresas na fatura de modelos.
