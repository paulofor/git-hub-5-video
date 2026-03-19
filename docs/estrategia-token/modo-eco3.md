# Modo ECO-3 — guard-rails para sessões longas

O **Modo ECO-3** complementa as rotinas de economia do ECO-2 adicionando limites rígidos de iterações/tokens e exigindo resumos agressivos de logs. Ele nasceu a partir de solicitações que consumiram dezenas de milhões de tokens ao repetir loops intermináveis (por exemplo, a solicitação #498, que registrou 545 interações e ultrapassou 33 milhões de tokens). Este documento descreve as novas alavancas disponíveis quando o perfil ECO-3 é selecionado no AI Hub.

## 1. Limites automáticos de iterações e tokens

- O sandbox encerra a execução automaticamente quando o modelo ultrapassa **120 iterações** em um único pedido. Isso evita que loops de ferramenta/reasoning sejam repetidos por horas.
- Também há um teto rígido de **800 mil tokens pagos**. Ao atingir esse limite, o job é encerrado com uma mensagem clara para que o usuário consolide o resumo manualmente.
- Ambos os limites podem ser ajustados via variáveis `ECO3_MAX_TURNS` e `ECO3_MAX_TOTAL_TOKENS`, mas os valores padrão são suficientes para conter os picos observados.

## 2. Compactação e truncamento agressivos

- O histórico alvo do ECO-3 é reduzido para **450 mil tokens**, contra 800 mil do ECO-2. Sempre que o histórico passa desse patamar, o sandbox remove itens antigos (primeiro ferramentas/respostas do assistente) até caber novamente.
- Mensagens de usuário têm um orçamento de **10 mil tokens** no total. Ao ultrapassar o limite, o sandbox automaticamente resume o texto e registra o que foi omitido.
- Logs e saídas de ferramentas são truncados para, no máximo, 3 000 caracteres por campo e 12 000 caracteres serializados. O objetivo é obrigar o agente a salvar anexos em arquivos separados em vez de injetar blobs gigantes no contexto.

## 3. Checkpoints explícitos quando algo é descartado

Sempre que o ECO-3 corta parte do histórico, ele adiciona anotações como `[Modo ECO-3: N tokens omitidos …]`. Assim o usuário sabe exatamente o que foi resumido ou removido e pode recuperar os detalhes no workspace (arquivos em `docs/`, `codex/` etc.).

## 4. Orientações para o agente

Selecione o perfil ECO-3 no AI Hub quando:

1. A tarefa envolve muito trial-and-error ou pipelines longos e você precisa de um seguro contra loops infinitos.
2. Há arquivos ou logs extremamente verbosos (ex.: compilações completas, migrations gigantes) que precisarão ser resumidos.
3. Você quer garantir que o job será interrompido automaticamente antes de gerar faturas imprevisíveis.

Enquanto o perfil estiver ativo, o agente deve:

- **Salvar artefatos grandes em arquivos** dentro do repo e referenciá-los no resumo em vez de retransmiti-los pelo chat.
- **Documentar cada truncamento** (scripts, diffs, dumps) com notas visíveis no resumo/modalidades de entrega.
- **Planejar checkpoints curtos**: finalize cada micro-objetivo com uma atualização textual em vez de acumular dezenas de tool calls sem feedback ao usuário.

## 5. Checklist rápido

1. O job parou por limite de iteração? → Gere um resumo, revise o plano e reinicie manualmente se ainda fizer sentido.
2. O job avisou sobre tokens altos? → Reavalie o escopo, compacte os dados em arquivos e só então rode novamente.
3. Precisa compartilhar logs completos? → Suba o arquivo para `docs/` ou `logs/` e cite o caminho. Não cole o conteúdo bruto no histórico.

Com esses guard-rails, o ECO-3 evita que solicitações pontuais esgotem o orçamento de tokens ao mesmo tempo em que mantém rastreabilidade e instruções claras para a equipe.
