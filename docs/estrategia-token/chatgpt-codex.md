# Perfil "Codex (ChatGPT)"

> Referência pública: o snippet do DuckDuckGo para [chatgpt.com/codex](https://duckduckgo.com/html/?q=ChatGPT+Codex) descreve o Codex como “um command center for agentic coding” com worktrees e ambientes em nuvem que permitem agentes paralelos finalizarem semanas de trabalho em dias.

Este perfil existe para aproximar a experiência interna do AI Hub do fluxo oferecido pela interface oficial do Codex no ChatGPT, com foco em custos previsíveis e coordenação multiagente.

## Princípios

1. **Command center multiagente**
   - Registre squads e owners responsáveis.
   - Mantenha um backlog único com status, riscos e próximos checkpoints.
2. **Worktrees e isolamentos rápidos**
   - Use `git worktree` ou diretórios `codex/<squad>` para cada frente.
   - Reaproveite artefatos gerados por outros squads sempre que possível.
3. **Execuções em nuvem e verificações curtas**
   - Priorize comandos pequenos, com logs compactados.
   - Prefira ambientes efêmeros (containers, tasks auxiliares) para validar hipóteses.
4. **Checkpoints narrativos e custos**
   - Final de cada turno deve indicar progresso, bloqueios, custo estimado e próximos passos.
   - Centralize no máximo 9k caracteres por tarefa para evitar estouro de contexto.

## Recomendações operacionais

- Campos principais do prompt: descrição curta, squads ativos, restrições de custo e links úteis.
- Cada `worktree` deve guardar um `STATUS.md` com tarefa, dono, último checkpoint e estimativa restante.
- Logs longos (>9k chars) precisam ser convertidos em resumos e anexos referenciados.
- Quando um squad terminar, compacte as mudanças e limpe o worktree para liberar espaço.
- Sempre converta resultados em bullets: **Objetivo**, **O que foi feito**, **O que falta**, **Custo estimado**.

## Quando usar

- Missões com múltiplas sub-tarefas paralelas.
- Situações em que reduzir reprocessamentos é mais importante do que maximizar autonomia do modelo.
- Quando há necessidade de justificar cada ciclo de gastos para stakeholders.

## Quando evitar

- Demandas de baixa complexidade (prefira ECO-1/ECO-2).
- Casos em que o sandbox não comporta múltiplos worktrees simultâneos.

Seguir estas diretrizes ajuda a manter a experiência alinhada ao aplicativo oficial e reduz o custo médio por solicitação.
