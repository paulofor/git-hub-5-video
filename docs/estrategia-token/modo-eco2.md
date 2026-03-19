# Guia prático para evitar custos altos ao usar modelos no Codex CLI

Este documento resume os mecanismos já presentes no cliente Codex (e como você pode utilizá‑los) para manter o consumo de tokens sob controle. Quando trechos de código forem citados, eles estão copiados abaixo para referência direta.

> Este conjunto de práticas alimenta o perfil de integração **ECO-2** no hub. Ao selecionar esse perfil, o sandbox aplica automaticamente as rotinas de compactação, limitação de histórico e truncamento descritas neste documento para conter custos sem exigir novas configurações do usuário.

## 1. Compactação automática sempre que o limite de tokens é atingido

Durante cada turno, o `run_turn` monitora `total_usage_tokens` e, caso o valor ultrapasse `auto_compact_limit` enquanto o modelo ainda precisa continuar respondendo, dispara uma compactação inline antes da próxima iteração. Isso garante que o histórico enviado ao modelo seja reduzido automaticamente.

Exemplo:
```rust
                let total_usage_tokens = sess.get_total_token_usage().await;
                let token_limit_reached = total_usage_tokens >= auto_compact_limit;

                let estimated_token_count =
                    sess.get_estimated_token_count(turn_context.as_ref()).await;

                trace!(
                    turn_id = %turn_context.sub_id,
                    total_usage_tokens,
                    estimated_token_count = ?estimated_token_count,
                    auto_compact_limit,
                    token_limit_reached,
                    needs_follow_up,
                    "post sampling token usage"
                );

                if token_limit_reached && needs_follow_up {
                    if run_auto_compact(
                        &sess,
                        &turn_context,
                        InitialContextInjection::BeforeLastUserMessage,
                    )
                    .await
                    .is_err()
                    {
                        return None;
                    }
                    continue;
                }
```

**Como aplicar:** mantenha `auto_compact_token_limit` configurado (via metadados do modelo ou `config.toml`) e deixe o fluxo de turnos fazer o trabalho de resumir o histórico automaticamente.

## 2. Compactação preventiva antes de cada turno e em trocas de modelo

Antes de enviar a primeira requisição do turno, o cliente verifica se já passou do limite de tokens e se houve downgrade para um modelo com janela menor. Caso positivo, roda a compactação antes mesmo de o modelo receber entradas adicionais.

Exemplo:
```rust
async fn run_pre_sampling_compact(
    sess: &Arc<Session>,
    turn_context: &Arc<TurnContext>,
) -> CodexResult<()> {
    let total_usage_tokens_before_compaction = sess.get_total_token_usage().await;
    maybe_run_previous_model_inline_compact(
        sess,
        turn_context,
        total_usage_tokens_before_compaction,
    )
    .await?;
    let total_usage_tokens = sess.get_total_token_usage().await;
    let auto_compact_limit = turn_context
        .model_info
        .auto_compact_token_limit()
        .unwrap_or(i64::MAX);
    if total_usage_tokens >= auto_compact_limit {
        run_auto_compact(sess, turn_context, InitialContextInjection::DoNotInject).await?;
    }
    Ok(())
}
```
Exemplo:
```rust
async fn maybe_run_previous_model_inline_compact(
    sess: &Arc<Session>,
    turn_context: &Arc<TurnContext>,
    total_usage_tokens: i64,
) -> CodexResult<bool> {
    let Some(previous_model) = sess.previous_model().await else {
        return Ok(false);
    };
    let previous_model_turn_context = Arc::new(
        turn_context
            .with_model(previous_model, &sess.services.models_manager)
            .await,
    );

    let Some(old_context_window) = previous_model_turn_context.model_context_window() else {
        return Ok(false);
    };
    let Some(new_context_window) = turn_context.model_context_window() else {
        return Ok(false);
    };
    let new_auto_compact_limit = turn_context
        .model_info
        .auto_compact_token_limit()
        .unwrap_or(i64::MAX);
    let should_run = total_usage_tokens > new_auto_compact_limit
        && previous_model_turn_context.model_info.slug != turn_context.model_info.slug
        && old_context_window > new_context_window;
    if should_run {
        run_auto_compact(
            sess,
            &previous_model_turn_context,
            InitialContextInjection::DoNotInject,
        )
        .await?;
        return Ok(true);
    }
    Ok(false)
}
```

**Como aplicar:** sempre que migrar um usuário para um modelo com janela menor, garanta que o histórico seja compactado usando esse mesmo helper para não desperdiçar tokens tentando enviar prompts grandes demais.

## 3. Seleção dinâmica entre compactação local e remota

Dependendo do provedor configurado, o Codex decide se usa o compactador embutido ou solicita um resumo ao backend (MCP). Isso permite aproveitar modelos especializados em compressão quando disponíveis, reduzindo o custo por delegar a tarefa a um serviço otimizado.

Exemplo:
```rust
async fn run_auto_compact(
    sess: &Arc<Session>,
    turn_context: &Arc<TurnContext>,
    initial_context_injection: InitialContextInjection,
) -> CodexResult<()> {
    if should_use_remote_compact_task(&turn_context.provider) {
        run_inline_remote_auto_compact_task(
            Arc::clone(sess),
            Arc::clone(turn_context),
            initial_context_injection,
        )
        .await?;
    } else {
        run_inline_auto_compact_task(
            Arc::clone(sess),
            Arc::clone(turn_context),
            initial_context_injection,
        )
        .await?;
    }
    Ok(())
}
```

**Como aplicar:** habilite MCP servers/serviços que ofereçam compaction especializado sempre que o provedor suportar (`should_use_remote_compact_task` retorna `true`).

## 4. Históricos resumidos com limite explícito de tokens

O módulo de compactação mantém apenas 20.000 tokens de mensagens de usuário e trunca a última mensagem caso o orçamento restante seja menor. Isso evita enviar todo o backlog e reduz o custo das próximas chamadas.

Exemplo:
```rust
const COMPACT_USER_MESSAGE_MAX_TOKENS: usize = 20_000;
```
Exemplo:
```rust
fn build_compacted_history_with_limit(
    mut history: Vec<ResponseItem>,
    user_messages: &[String],
    summary_text: &str,
    max_tokens: usize,
) -> Vec<ResponseItem> {
    let mut selected_messages: Vec<String> = Vec::new();
    if max_tokens > 0 {
        let mut remaining = max_tokens;
        for message in user_messages.iter().rev() {
            if remaining == 0 {
                break;
            }
            let tokens = approx_token_count(message);
            if tokens <= remaining {
                selected_messages.push(message.clone());
                remaining = remaining.saturating_sub(tokens);
            } else {
                let truncated = truncate_text(message, TruncationPolicy::Tokens(remaining));
                selected_messages.push(truncated);
                break;
            }
        }
        selected_messages.reverse();
    }
```

**Como aplicar:** mantenha o histórico de usuário na faixa dos 20k tokens (ou ajuste) para garantir que apenas o contexto relevante seja enviado a cada reconstrução de prompt.

## 5. Poda de chamadas de função antes de compactar remotamente

Antes de pedir a outro modelo que compacte o histórico, o Codex remove itens gerados por ele mesmo até que a contagem estimada de tokens caiba na janela do modelo-alvo. Isso impede gastar tokens só para o compactador rejeitar a requisição.

Exemplo:
```rust
fn trim_function_call_history_to_fit_context_window(
    history: &mut ContextManager,
    turn_context: &TurnContext,
    base_instructions: &BaseInstructions,
) -> usize {
    let mut deleted_items = 0usize;
    let Some(context_window) = turn_context.model_context_window() else {
        return deleted_items;
    };

    while history
        .estimate_token_count_with_base_instructions(base_instructions)
        .is_some_and(|estimated_tokens| estimated_tokens > context_window)
    {
        let Some(last_item) = history.raw_items().last() else {
            break;
        };
        if !is_codex_generated_item(last_item) {
            break;
        }
        if !history.remove_last_item() {
            break;
        }
        deleted_items += 1;
    }

    deleted_items
}
```

**Como aplicar:** sempre normalize/pode o histórico antes de invocar serviços externos de compactação para não desperdiçar chamadas com prompts maiores que a janela do modelo auxiliar.

## 6. Truncamento de saídas de ferramentas antes de devolvê-las ao modelo

Qualquer saída de função/ferramenta passa por `truncate_function_output_items_with_policy`, que mantém apenas o que cabe no orçamento e adiciona um marcador do que foi omitido.

Exemplo:
```rust
pub(crate) fn truncate_function_output_items_with_policy(
    items: &[FunctionCallOutputContentItem],
    policy: TruncationPolicy,
) -> Vec<FunctionCallOutputContentItem> {
    let mut out: Vec<FunctionCallOutputContentItem> = Vec::with_capacity(items.len());
    let mut remaining_budget = match policy {
        TruncationPolicy::Bytes(_) => policy.byte_budget(),
        TruncationPolicy::Tokens(_) => policy.token_budget(),
    };
    let mut omitted_text_items = 0usize;

    for it in items {
        match it {
            FunctionCallOutputContentItem::InputText { text } => {
                if remaining_budget == 0 {
                    omitted_text_items += 1;
                    continue;
                }

                let cost = match policy {
                    TruncationPolicy::Bytes(_) => text.len(),
                    TruncationPolicy::Tokens(_) => approx_token_count(text),
                };

                if cost <= remaining_budget {
                    out.push(FunctionCallOutputContentItem::InputText { text: text.clone() });
                    remaining_budget = remaining_budget.saturating_sub(cost);
                } else {
                    let snippet_policy = match policy {
                        TruncationPolicy::Bytes(_) => TruncationPolicy::Bytes(remaining_budget),
                        TruncationPolicy::Tokens(_) => TruncationPolicy::Tokens(remaining_budget),
                    };
                    let snippet = truncate_text(text, snippet_policy);
                    if snippet.is_empty() {
                        omitted_text_items += 1;
                    } else {
                        out.push(FunctionCallOutputContentItem::InputText { text: snippet });
                    }
                    remaining_budget = 0;
                }
            }
            FunctionCallOutputContentItem::InputImage { image_url } => {
                out.push(FunctionCallOutputContentItem::InputImage {
                    image_url: image_url.clone(),
                });
            }
        }
    }

    if omitted_text_items > 0 {
        out.push(FunctionCallOutputContentItem::InputText {
            text: format!("[omitted {omitted_text_items} text items ...]"),
        });
    }

    out
}
```

**Como aplicar:** defina políticas de truncamento adequadas para cada ferramenta para que nunca devolvam blobs gigantes ao modelo principal.

## 7. Teto de tokens para execuções interativas no terminal

Mesmo comandos longos no `unified_exec` respeitam `DEFAULT_MAX_OUTPUT_TOKENS` (10.000) quando nenhum valor customizado é passado, evitando que logs massivos sejam reenviados ao modelo.

Exemplo:
```rust
pub(crate) const DEFAULT_MAX_OUTPUT_TOKENS: usize = 10_000;
...
pub(crate) fn resolve_max_tokens(max_tokens: Option<usize>) -> usize {
    max_tokens.unwrap_or(DEFAULT_MAX_OUTPUT_TOKENS)
}
```

**Como aplicar:** deixe o padrão quando possível e só aumente `max_output_tokens` se for realmente necessário inspecionar saídas muito longas (isso evita pagar por contexto inútil).

## 8. Injeção incremental de contexto (sem repetir instruções inteiras)

O módulo `context_manager::updates` só injeta diferenças (mudança de ambiente, permissões, personalidade, etc.) quando algo realmente mudou. Assim, os prompts não são inflados por instruções repetidas em todo turno.

Exemplo:
```rust
pub(crate) fn build_settings_update_items(
    previous: Option<&TurnContextItem>,
    previous_user_turn_model: Option<&str>,
    next: &TurnContext,
    shell: &Shell,
    exec_policy: &Policy,
    personality_feature_enabled: bool,
) -> Vec<ResponseItem> {
    let mut update_items = Vec::new();

    if let Some(model_instructions_item) =
        build_model_instructions_update_item(previous_user_turn_model, next)
    {
        update_items.push(model_instructions_item);
    }
    if let Some(env_item) = build_environment_update_item(previous, next, shell) {
        update_items.push(env_item);
    }
    if let Some(permissions_item) = build_permissions_update_item(previous, next, exec_policy) {
        update_items.push(permissions_item);
    }
    if let Some(collaboration_mode_item) = build_collaboration_mode_update_item(previous, next) {
        update_items.push(collaboration_mode_item);
    }
    if let Some(personality_item) =
        build_personality_update_item(previous, next, personality_feature_enabled)
    {
        update_items.push(personality_item);
    }

    update_items
}
```

**Como aplicar:** mantenha o rastreamento correto de `TurnContextItem` para que apenas diffs sejam adicionados — qualquer reedição completa de instruções causa inflação de tokens desnecessária.

## 9. Tornar o custo visível ao usuário final

Sempre que um turno termina, o processador de eventos imprime o total de tokens usados. Essa visibilidade incentiva o usuário a encurtar prompts ou ajustar o plano quando necessário.

Exemplo:
```rust
    fn print_final_output(&mut self) {
        self.finish_progress_line();
        if let Some(usage_info) = &self.last_total_token_usage {
            eprintln!(
                "{}\n{}",
                "tokens used".style(self.magenta).style(self.italic),
                format_with_separators(usage_info.total_token_usage.blended_total())
            );
        }

        if let Some(message) = &self.final_message {
            if message.ends_with('\n') {
                print!("{message}");
            } else {
                println!("{message}");
            }
        }
    }
```

**Como aplicar:** exponha sempre o total de tokens (inclusive em automações/CI) para que equipes consigam auditar sessões caras rapidamente.

## 10. Bloqueio automático de tentativas idênticas de tool

Para evitar que o ECO-2 desperdice tokens executando infinitamente o mesmo comando, o orquestrador monitora as últimas chamadas de `run_shell`, `http_get`/`WebSearch` e `db_query`. Quando as *N* chamadas mais recentes (padrão 3, configurável via `ECO2_MAX_IDENTICAL_TOOL_ATTEMPTS`) têm a mesma assinatura e retornam a mesma saída, a próxima tentativa é interceptada com um aviso em vez de reexecutar o comando.

```ts
        const toolSignature = this.buildToolSignature(toolCall);
        const loopBlock = this.evaluateEcoTwoLoopBlock(job, toolSignature, toolCall.name ?? '');
        if (loopBlock) {
          this.log(job, loopBlock.logMessage);
          const blockOutput = this.prepareToolOutput(loopBlock.payload, job);
          toolMessages.push({
            id: outputId,
            call_id: callId,
            output: blockOutput,
            type: 'function_call_output',
          });
          continue;
        }
```

```ts
  private evaluateEcoTwoLoopBlock(
    job: SandboxJob,
    signature: string,
    toolName: string,
  ): EcoTwoLoopBlockResult | undefined {
    if (!this.isEcoTwo(job) || !this.isEcoTwoLoopGuardedTool(toolName)) {
      return undefined;
    }
    const state = this.getEcoTwoLoopState(job);
    const recent = state.attempts.slice(-this.ecoTwoMaxIdenticalToolAttempts);
    if (!recent.every((attempt) => attempt.signature === signature)) {
      return undefined;
    }
    const uniqueOutputs = new Set(recent.map((attempt) => attempt.outputHash));
    if (uniqueOutputs.size !== 1) {
      return undefined;
    }
    state.blockedSignature = signature;
    state.blockedCount += 1;
    const attempts = this.ecoTwoMaxIdenticalToolAttempts;
    return {
      payload: {
        error: 'Modo ECO-2 bloqueou a execução repetida desta tool.',
        tool: toolName || 'desconhecida',
        attemptsConsidered: attempts,
        guidance:
          'Revise o plano, edite os arquivos necessários ou explique o que mudou antes de repetir o mesmo comando.',
      },
      logMessage: `Modo ECO-2: loop bloqueado para ${toolName || 'tool'} após ${attempts} respostas idênticas.`,
    };
  }
```

**Como aplicar:**

- Use `ECO2_MAX_IDENTICAL_TOOL_ATTEMPTS` para escolher quantas repetições consecutivas são toleradas (padrão 3) e `ECO2_LOOP_HISTORY_SIZE` para definir o tamanho da janela monitorada.
- Quando o sandbox retornar o aviso acima, explique explicitamente o que mudou ou altere a estratégia antes de chamar novamente a mesma ferramenta; uma simples repetição continuará bloqueada.
- Sempre que o agente fizer alterações em disco (`write_file`, scripts de patch, etc.), limpe o histórico correspondente para liberar novas tentativas — o próprio orchestrator já reseta o estado ao usar `write_file`.

## Checklist de atuação

1. **Configure limites realistas** (`auto_compact_token_limit`, `max_output_tokens`, políticas de truncamento) para cada modo de trabalho.
2. **Habilite compactação remota** quando disponível para delegar resumos a serviços mais baratos.
3. **Revise periodicamente o histórico**: se usuários mantêm threads muito longas, incentive o uso de `/compact` manual ou reinício de sessão.
4. **Instrua usuários a observar o contador de tokens** após cada turno; isso ajuda a calibrar prompts menores.
5. **Audite ferramentas personalizadas** para garantir que elas respeitam as mesmas funções utilitárias de truncamento antes de devolver resultados ao modelo.

Adotando essas práticas (já suportadas pelo próprio cliente), o time mantém o contexto enxuto e evita que turnos triviais gastem a janela inteira do modelo, reduzindo o custo total de uso.
