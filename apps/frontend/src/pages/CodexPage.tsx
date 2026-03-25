import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useToasts } from '../components/ToastContext';
import {
  CodexProfile,
  CodexRequest,
  codexStatusStyles,
  formatCost,
  formatDateTime,
  formatDuration,
  formatPricePerMillion,
  formatProfile,
  formatStatus,
  formatTokens,
  isTerminalStatus,
  parseCodexRequest,
  parseCodexRequests
} from '../lib/codex';

interface EnvironmentOption {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
}

interface CodexModelOption {
  id: number;
  modelName: string;
  displayName?: string | null;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  outputPricePerMillion: number;
}

interface PromptHintOption {
  id: number;
  label: string;
  phrase: string;
  environmentId?: number | null;
  environmentName?: string | null;
}

interface ActiveProblemOption {
  id: number;
  title: string;
  includedAt: string;
  totalCost?: number | null;
}

const REQUESTS_PER_PAGE = 5;
const ACTIVE_POLL_INTERVAL_MS = 15000;

export default function CodexPage() {
  const [prompt, setPrompt] = useState('');
  const [environment, setEnvironment] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<number | null>(null);
  const [activeProblems, setActiveProblems] = useState<ActiveProblemOption[]>([]);
  const [loadingProblems, setLoadingProblems] = useState(false);
  const [problemsError, setProblemsError] = useState<string | null>(null);
  const [selectedProblemId, setSelectedProblemId] = useState('');
  const [profile, setProfile] = useState<CodexProfile>('STANDARD');
  const [model, setModel] = useState('');
  const [requestsByPage, setRequestsByPage] = useState<Record<number, CodexRequest[]>>({});
  const [totalRequests, setTotalRequests] = useState(0);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [environmentOptions, setEnvironmentOptions] = useState<EnvironmentOption[]>([]);
  const [modelOptions, setModelOptions] = useState<CodexModelOption[]>([]);
  const [promptHints, setPromptHints] = useState<PromptHintOption[]>([]);
  const [selectedPromptHintIds, setSelectedPromptHintIds] = useState<number[]>([]);
  const [promptHintsError, setPromptHintsError] = useState<string | null>(null);
  const [loadingPromptHints, setLoadingPromptHints] = useState(false);
  const [loadingActions, setLoadingActions] = useState<Record<number, boolean>>({});
  const { pushToast } = useToasts();
  const setActionLoading = useCallback((id: number, loading: boolean) => {
    setLoadingActions((prev) => {
      if (loading) {
        return { ...prev, [id]: true };
      }
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleCopyPrompt = useCallback(
    async (text: string) => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
        pushToast('Prompt copiado para a área de transferência.');
      } catch (err) {
        pushToast('Não foi possível copiar o prompt.', 'error');
      }
    },
    [pushToast]
  );

  const handlePromptHintToggle = useCallback((hintId: number, checked: boolean) => {
    setSelectedPromptHintIds((prev) => {
      if (checked) {
        if (prev.includes(hintId)) {
          return prev;
        }
        return [...prev, hintId];
      }
      return prev.filter((id) => id !== hintId);
    });
  }, []);

  const handleEnvironmentSelection = useCallback((name: string) => {
    setEnvironment(name);
    const match = environmentOptions.find((option) => option.name === name);
    setSelectedEnvironmentId(match ? match.id : null);
    setSelectedProblemId('');
    setActiveProblems([]);
    setProblemsError(null);
  }, [environmentOptions]);

  const formatProblemOptionLabel = useCallback((problem: ActiveProblemOption) => {
    const includedDate = problem.includedAt ? new Date(problem.includedAt).toLocaleDateString('pt-BR') : 'sem data';
    const totalCost = typeof problem.totalCost === 'number' ? problem.totalCost : 0;
    return `#${problem.id} — ${problem.title} (desde ${includedDate}, custo ${formatCost(totalCost, 4)})`;
  }, []);

  const mergeRequest = useCallback((updated: CodexRequest) => {
    let isNew = false;
    setRequestsByPage((prev) => {
      const next: Record<number, CodexRequest[]> = {};
      let found = false;
      Object.entries(prev).forEach(([pageKey, items]) => {
        const pageNumber = Number(pageKey);
        const index = items.findIndex((item) => item.id === updated.id);
        if (index === -1) {
          next[pageNumber] = items;
          return;
        }
        const updatedItems = [...items];
        updatedItems[index] = updated;
        next[pageNumber] = updatedItems;
        found = true;
      });
      if (!found) {
        isNew = true;
        const firstPageItems = prev[1] ? [...prev[1]] : [];
        firstPageItems.unshift(updated);
        next[1] = firstPageItems.slice(0, REQUESTS_PER_PAGE);
      }
      return next;
    });
    if (isNew) {
      setTotalRequests((prev) => prev + 1);
    }
  }, []);

  const fetchRequests = useCallback(async (page = 1, options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoadingRequests(true);
    }
    try {
      const response = await client.get('/codex/requests', {
        params: {
          page: page - 1,
          size: REQUESTS_PER_PAGE
        }
      });
      setRequestsByPage((prev) => ({
        ...prev,
        [page]: parseCodexRequests(response.data)
      }));
      const total = typeof response.data?.totalElements === 'number'
        ? response.data.totalElements
        : Array.isArray(response.data)
          ? response.data.length
          : totalRequests;
      if (Number.isFinite(total)) {
        setTotalRequests(total);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (!options?.silent) {
        setLoadingRequests(false);
      }
    }
  }, [totalRequests]);

  useEffect(() => {
    fetchRequests(1);
  }, [fetchRequests]);

  useEffect(() => {
    const loadedPages = Object.keys(requestsByPage).map(Number).filter((page) => Number.isFinite(page));
    const hasActive = loadedPages.some((page) =>
      (requestsByPage[page] ?? []).some((item) => !isTerminalStatus(item.status))
    );
    if (!hasActive) {
      return () => undefined;
    }
    const interval = setInterval(() => {
      loadedPages.forEach((page) => {
        fetchRequests(page, { silent: true }).catch(() => undefined);
      });
    }, ACTIVE_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [requestsByPage, fetchRequests]);

  useEffect(() => {
    client
      .get<EnvironmentOption[]>('/environments')
      .then((response) => {
        setEnvironmentOptions(response.data);
        if (response.data.length === 0) {
          setEnvironment('');
          setSelectedEnvironmentId(null);
          setSelectedProblemId('');
          setActiveProblems([]);
          return;
        }
        setEnvironment((current) => {
          const hasCurrent = current && response.data.some((item) => item.name === current);
          const resolved = hasCurrent ? current : response.data[0]?.name ?? '';
          const matched = response.data.find((item) => item.name === resolved) ?? null;
          setSelectedEnvironmentId(matched ? matched.id : null);
          if (!matched) {
            setSelectedProblemId('');
            setActiveProblems([]);
          }
          return resolved;
        });
      })
      .catch((err: Error) => {
        setError(err.message);
        setSelectedEnvironmentId(null);
        setSelectedProblemId('');
        setActiveProblems([]);
      });
  }, []);

  useEffect(() => {
    client
      .get<CodexModelOption[]>('/codex/models')
      .then((response) => {
        setModelOptions(response.data);
        setModel((current) => {
          if (current && response.data.some((item) => item.modelName === current)) {
            return current;
          }
          return response.data[0]?.modelName ?? '';
        });
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const trimmedEnvironment = environment.trim();
    if (!trimmedEnvironment) {
      setPromptHints([]);
      setSelectedPromptHintIds([]);
      setPromptHintsError(null);
      setLoadingPromptHints(false);
      return;
    }

    let cancelled = false;
    setLoadingPromptHints(true);
    client
      .get<PromptHintOption[]>('/prompt-hints', {
        params: { environment: trimmedEnvironment }
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPromptHints(response.data);
        setPromptHintsError(null);
        setSelectedPromptHintIds((prev) => prev.filter((id) => response.data.some((hint) => hint.id === id)));
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setPromptHintsError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingPromptHints(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [environment]);

  useEffect(() => {
    if (!selectedEnvironmentId) {
      setActiveProblems([]);
      setProblemsError(null);
      setSelectedProblemId('');
      setLoadingProblems(false);
      return;
    }
    let cancelled = false;
    setLoadingProblems(true);
    setProblemsError(null);
    client
      .get<ActiveProblemOption[]>('/problems/active', {
        params: { environmentId: selectedEnvironmentId }
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setActiveProblems(response.data);
        setProblemsError(null);
        setSelectedProblemId((current) => {
          if (current && response.data.some((problem) => String(problem.id) === current)) {
            return current;
          }
          return '';
        });
      })
      .catch((err: Error) => {
        if (cancelled) {
          return;
        }
        setProblemsError(err.message);
        setActiveProblems([]);
        setSelectedProblemId('');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProblems(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEnvironmentId]);

  const totalPages = Math.max(1, Math.ceil(totalRequests / REQUESTS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previousPage) => Math.min(previousPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!requestsByPage[currentPage]) {
      fetchRequests(currentPage);
    }
  }, [currentPage, fetchRequests, requestsByPage]);

  const paginatedRequests = useMemo(() => {
    return requestsByPage[currentPage] ?? [];
  }, [currentPage, requestsByPage]);

  const isPageLoading = loadingRequests && paginatedRequests.length === 0;

  const selectedModel = useMemo(() => {
    return modelOptions.find((option) => option.modelName === model) ?? null;
  }, [modelOptions, model]);

  const selectedPromptHints = useMemo(() => {
    if (promptHints.length === 0 || selectedPromptHintIds.length === 0) {
      return [];
    }
    const hintsById = new Map(promptHints.map((hint) => [hint.id, hint]));
    return selectedPromptHintIds
      .map((id) => hintsById.get(id))
      .filter((hint): hint is PromptHintOption => Boolean(hint));
  }, [promptHints, selectedPromptHintIds]);

  const generalPromptHints = useMemo(
    () => promptHints.filter((hint) => !hint.environmentId),
    [promptHints]
  );

  const scopedPromptHints = useMemo(
    () => promptHints.filter((hint) => hint.environmentId),
    [promptHints]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    const trimmedEnvironment = environment.trim();
    const trimmedModel = model.trim();

    if (!trimmedPrompt || !trimmedEnvironment) {
      setError('Informe o prompt e o ambiente antes de enviar.');
      return;
    }

    if (!trimmedModel) {
      setError('Selecione um modelo para enviar a solicitação.');
      return;
    }

    const hintPhrases = selectedPromptHints
      .map((hint) => hint.phrase.trim())
      .filter((value) => value.length > 0);

    const finalPrompt = hintPhrases.length > 0
      ? `${trimmedPrompt}\n\n${hintPhrases.join('\n')}`
      : trimmedPrompt;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.post('/codex/requests', {
        prompt: finalPrompt,
        environment: trimmedEnvironment,
        profile,
        model: trimmedModel,
        problemId: selectedProblemId ? Number(selectedProblemId) : undefined
      });
      const parsed = parseCodexRequest(response.data);
      if (parsed) {
        mergeRequest(parsed);
      }
      setPrompt('');
      setSelectedPromptHintIds([]);
      setEnvironment(trimmedEnvironment);
      setModel(trimmedModel);
      setSuccessMessage('Solicitação enviada para o Codex.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = useCallback(async (requestId: number) => {
    setActionLoading(requestId, true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.post(`/codex/requests/${requestId}/cancel`);
      const parsed = parseCodexRequest(response.data);
      if (parsed) {
        mergeRequest(parsed);
        setSuccessMessage('Solicitação cancelada.');
      } else {
        await fetchRequests(currentPage);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(requestId, false);
    }
  }, [currentPage, fetchRequests, mergeRequest, setActionLoading]);

  const handleRating = useCallback(async (requestId: number, rating: number) => {
    setActionLoading(requestId, true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.post(`/codex/requests/${requestId}/rating`, { rating });
      const parsed = parseCodexRequest(response.data);
      if (parsed) {
        mergeRequest(parsed);
        setSuccessMessage('Avaliação registrada.');
      } else {
        await fetchRequests(currentPage);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(requestId, false);
    }
  }, [currentPage, fetchRequests, mergeRequest, setActionLoading]);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Codex</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Envie tarefas para o Codex informando o ambiente, o modelo e o perfil de uso desejados.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="environment" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Ambiente
            </label>
            <select
              id="environment"
              value={environment}
              onChange={(event) => handleEnvironmentSelection(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              disabled={environmentOptions.length === 0}
            >
              {environmentOptions.length === 0 ? (
                <option value="">Nenhum ambiente cadastrado</option>
              ) : (
                environmentOptions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                    {option.description ? ` — ${option.description}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="problem-id" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Problema em aberto (opcional)
            </label>
            <select
              id="problem-id"
              value={selectedProblemId}
              onChange={(event) => setSelectedProblemId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              disabled={selectedEnvironmentId === null || loadingProblems || activeProblems.length === 0}
            >
              <option value="">Não vincular</option>
              {activeProblems.map((problem) => (
                <option key={problem.id} value={String(problem.id)}>
                  {formatProblemOptionLabel(problem)}
                </option>
              ))}
            </select>
            {loadingProblems && <span className="text-xs text-slate-500">Carregando problemas em aberto...</span>}
            {problemsError && <span className="text-xs text-red-500">{problemsError}</span>}
            {!loadingProblems && !problemsError && selectedEnvironmentId && activeProblems.length === 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">Nenhum problema ativo para este ambiente.</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="model" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Modelo
            </label>
            <select
              id="model"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              disabled={modelOptions.length === 0}
            >
              {modelOptions.length === 0 ? (
                <option value="">Nenhum modelo cadastrado</option>
              ) : (
                modelOptions.map((option) => (
                  <option key={option.id} value={option.modelName}>
                    {(option.displayName ?? option.modelName) + ` — ${option.modelName}`}
                  </option>
                ))
              )}
            </select>
            {selectedModel && (
              <div className="rounded-md border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-semibold">
                  Valores por 1M tokens para {selectedModel.displayName ?? selectedModel.modelName}:
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <span>Input: {formatPricePerMillion(selectedModel.inputPricePerMillion)}</span>
                  <span>Input cacheado: {formatPricePerMillion(selectedModel.cachedInputPricePerMillion)}</span>
                  <span>Output: {formatPricePerMillion(selectedModel.outputPricePerMillion)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Perfil de integração</span>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="codex-profile"
                  value="STANDARD"
                  checked={profile === 'STANDARD'}
                  onChange={() => setProfile('STANDARD')}
                  className="h-4 w-4"
                />
                <span>
                  Padrão
                  <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                    Máxima autonomia do modelo
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="codex-profile"
                  value="CHATGPT_CODEX"
                  checked={profile === 'CHATGPT_CODEX'}
                  onChange={() => setProfile('CHATGPT_CODEX')}
                  className="h-4 w-4"
                />
                <span>
                  Codex (ChatGPT)
                  <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                    Replica o command center multiagente do chatgpt.com/codex: organize squads paralelos, use worktrees/diretórios temáticos e sincronize checkpoints curtos conforme descrito em docs/estrategia-token/chatgpt-codex.md.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="codex-profile"
                  value="ECO_1"
                  checked={profile === 'ECO_1'}
                  onChange={() => setProfile('ECO_1')}
                  className="h-4 w-4"
                />
                <span>
                  ECO-1
                  <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                    Segue o guia docs/estrategia-token/modo-eco1.md: limita instruções fixas, trunca outputs das tools e troca automaticamente para modelos mais baratos.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="codex-profile"
                  value="ECO_2"
                  checked={profile === 'ECO_2'}
                  onChange={() => setProfile('ECO_2')}
                  className="h-4 w-4"
                />
                <span>
                  ECO-2
                  <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                    Ativa as rotinas do docs/estrategia-token/modo-eco2.md: compactações automáticas, histórico de usuário limitado a 20k tokens e truncamento agressivo de outputs/remotes.
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="radio"
                  name="codex-profile"
                  value="ECO_3"
                  checked={profile === 'ECO_3'}
                  onChange={() => setProfile('ECO_3')}
                  className="h-4 w-4"
                />
                <span>
                  ECO-3
                  <span className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                    Regras extras do docs/estrategia-token/modo-eco3.md: resuma logs longos antes de reenviá-los, respeite o teto de 120 iterações/800k tokens e registre tudo que for descartado para manter rastreabilidade.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="prompt" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Descreva uma tarefa
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
              placeholder="Descreva o que o Codex deve fazer..."
            />
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/50">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-700 dark:text-slate-200">Itens opcionais para complementar o prompt</p>
                <Link
                  to="/prompt-hints"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-500"
                >
                  Gerenciar itens
                </Link>
              </div>
              {loadingPromptHints && (
                <p className="text-xs text-slate-500 dark:text-slate-400">Carregando itens disponíveis...</p>
              )}
              {promptHintsError && (
                <p className="text-xs text-red-500">{promptHintsError}</p>
              )}
              {!loadingPromptHints && !promptHintsError && promptHints.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nenhum item configurado para este ambiente.
                </p>
              )}
              {(generalPromptHints.length > 0 || scopedPromptHints.length > 0) && (
                <div className="space-y-4">
                  {generalPromptHints.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Itens gerais
                      </p>
                      <div className="space-y-2">
                        {generalPromptHints.map((hint) => (
                          <label key={hint.id} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={selectedPromptHintIds.includes(hint.id)}
                              onChange={(event) => handlePromptHintToggle(hint.id, event.target.checked)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>
                              {hint.label}
                              <span className="block whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                                {hint.phrase}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {scopedPromptHints.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Itens para {environment || 'o ambiente selecionado'}
                      </p>
                      <div className="space-y-2">
                        {scopedPromptHints.map((hint) => (
                          <label key={hint.id} className="flex items-start gap-2 text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={selectedPromptHintIds.includes(hint.id)}
                              onChange={(event) => handlePromptHintToggle(hint.id, event.target.checked)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <span>
                              {hint.label}
                              <span className="block whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                                {hint.phrase}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={loading || environmentOptions.length === 0 || modelOptions.length === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Enviando...' : 'Enviar para o Codex'}
            </button>
            {error && <span className="text-sm text-red-500">{error}</span>}
            {successMessage && <span className="text-sm text-blue-600">{successMessage}</span>}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Histórico de solicitações</h3>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 sm:p-4">
          {isPageLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Carregando solicitações...
            </div>
          )}

          {!isPageLoading && totalRequests === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
              Nenhuma solicitação enviada até o momento.
            </div>
          )}

          {!isPageLoading && paginatedRequests.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2">
              {paginatedRequests.map((item) => (
                <article key={item.id} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link to={`/codex/requests/${item.id}`} className="text-sm font-semibold text-blue-700 hover:underline">
                        {formatDateTime(item.createdAt)}
                      </Link>
                      <div className="text-xs text-slate-400">ID #{item.id}</div>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${codexStatusStyles[item.status]}`}
                    >
                      {formatStatus(item.status)}
                    </span>
                  </div>

                  <div className="grid gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                    <div><span className="font-semibold">Ambiente:</span> {item.environment}</div>
                    <div><span className="font-semibold">Perfil:</span> {formatProfile(item.profile)}</div>
                    <div><span className="font-semibold">Modelo:</span> {item.model || '—'}</div>
                    <div><span className="font-semibold">Versão:</span> {item.version || '—'}</div>
                    <div><span className="font-semibold">Início:</span> {formatDateTime(item.startedAt ?? item.createdAt)}</div>
                    <div><span className="font-semibold">Fim:</span> {formatDateTime(item.finishedAt)}</div>
                    <div><span className="font-semibold">Tempo total:</span> {formatDuration(item.durationMs)}</div>
                    <div><span className="font-semibold">Timeouts:</span> {(item.timeoutCount ?? 0).toLocaleString('pt-BR')}</div>
                    <div><span className="font-semibold">HTTP GETs:</span> {(item.httpGetCount ?? 0).toLocaleString('pt-BR')}</div>
                    <div><span className="font-semibold">Consultas SQL:</span> {(item.dbQueryCount ?? 0).toLocaleString('pt-BR')}</div>
                  </div>

                  <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                    {item.problemTitle ? (
                      <p className="font-semibold">#{item.problemId} — {item.problemTitle}</p>
                    ) : (
                      <span className="text-slate-400">Problema: —</span>
                    )}
                  </div>

                  <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
                    <div className="space-y-1 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                      <p className="font-semibold text-slate-700 dark:text-slate-100">Tokens</p>
                      <div className="flex items-center justify-between"><span>Input</span><span>{formatTokens(item.promptTokens)}</span></div>
                      <div className="flex items-center justify-between"><span>Input cacheado</span><span>{formatTokens(item.cachedPromptTokens)}</span></div>
                      <div className="flex items-center justify-between"><span>Output</span><span>{formatTokens(item.completionTokens)}</span></div>
                      <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-100"><span>Total</span><span>{formatTokens(item.totalTokens)}</span></div>
                    </div>
                    <div className="space-y-1 rounded-md border border-slate-200 p-2 dark:border-slate-700">
                      <p className="font-semibold text-slate-700 dark:text-slate-100">Custos</p>
                      <div className="flex items-center justify-between"><span>Input</span><span>{formatCost(item.promptCost, 4)}</span></div>
                      <div className="flex items-center justify-between"><span>Input cacheado</span><span>{formatCost(item.cachedPromptCost, 4)}</span></div>
                      <div className="flex items-center justify-between"><span>Output</span><span>{formatCost(item.completionCost, 4)}</span></div>
                      <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-100"><span>Total</span><span>{formatCost(item.cost)}</span></div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <details>
                      <summary className="cursor-pointer text-blue-600">Ver prompt</summary>
                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(item.prompt)}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Copiar prompt
                      </button>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-900/90 p-2 text-xs text-blue-100">
                        {item.prompt}
                      </pre>
                    </details>

                    {item.responseText && (
                      <details>
                        <summary className="cursor-pointer text-blue-600">Ver resposta</summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-900/90 p-2 text-xs text-blue-100">
                          {item.responseText}
                        </pre>
                      </details>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                    {item.userComment ? (
                      <p className="whitespace-pre-line text-slate-600 dark:text-slate-300">
                        {item.userComment.length > 200 ? `${item.userComment.slice(0, 200)}…` : item.userComment}
                      </p>
                    ) : (
                      <span className="text-slate-500">Sem comentário.</span>
                    )}
                    <Link to={`/codex/requests/${item.id}`} className="font-semibold text-blue-600 hover:underline">
                      {item.userComment ? 'Ver detalhes' : 'Adicionar comentário'}
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
                    {(() => {
                      const currentRating = item.rating ?? 0;
                      const isInteractive = item.status === 'COMPLETED';
                      if (!isInteractive && currentRating === 0) {
                        return <span className="text-xs text-slate-500">Avaliação: —</span>;
                      }
                      return (
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((value) => {
                            const filled = value <= currentRating;
                            if (!isInteractive) {
                              return (
                                <span
                                  key={`static-${item.id}-${value}`}
                                  className={`text-lg ${filled ? 'text-amber-500' : 'text-slate-400'}`}
                                >
                                  ★
                                </span>
                              );
                            }
                            return (
                              <button
                                key={`rate-${item.id}-${value}`}
                                type="button"
                                onClick={() => handleRating(item.id, value)}
                                disabled={Boolean(loadingActions[item.id])}
                                className="text-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                                title={`Avaliar como ${value}`}
                              >
                                <span className={filled ? 'text-amber-500' : 'text-slate-400'}>★</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {item.status === 'PENDING' || item.status === 'RUNNING' ? (
                      <button
                        type="button"
                        onClick={() => handleCancel(item.id)}
                        disabled={Boolean(loadingActions[item.id])}
                        className="rounded-md border border-red-500 px-3 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-400/10"
                      >
                        {loadingActions[item.id] ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">Sem ações disponíveis</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {totalRequests > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <span>
                Mostrando {(currentPage - 1) * REQUESTS_PER_PAGE + 1}–
                {Math.min(totalRequests, currentPage * REQUESTS_PER_PAGE)} de {totalRequests} solicitações
              </span>

              {totalRequests > REQUESTS_PER_PAGE && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Anterior
                  </button>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
