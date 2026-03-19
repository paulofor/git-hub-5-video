import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import client from '../api/client';
import { useToasts } from '../components/ToastContext';
import {
  CodexRequest,
  codexStatusStyles,
  formatCost,
  formatDateTime,
  formatDuration,
  formatProfile,
  formatStatus,
  formatTokens,
  isTerminalStatus,
  parseCodexRequest,
  parseCodexRequests
} from '../lib/codex';

export default function CodexRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [request, setRequest] = useState<CodexRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [resolutionDifficulty, setResolutionDifficulty] = useState('');
  const [executionLog, setExecutionLog] = useState('');
  const [feedbackDirty, setFeedbackDirty] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const [downloadingInteractions, setDownloadingInteractions] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [nextRequestId, setNextRequestId] = useState<number | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const navigate = useNavigate();
  const feedbackDirtyRef = useRef(false);
  const { pushToast } = useToasts();

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

  useEffect(() => {
    feedbackDirtyRef.current = feedbackDirty;
  }, [feedbackDirty]);

  const fetchRequest = useCallback(
    async (silent = false) => {
      if (!id) {
        setError('ID da solicitação inválido.');
        setLoading(false);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const response = await client.get(`/codex/requests/${id}`);
        const parsed = parseCodexRequest(response.data);
        if (!parsed) {
          throw new Error('Não foi possível carregar a solicitação.');
        }
        setRequest(parsed);
        if (!feedbackDirtyRef.current) {
          setComment(parsed.userComment ?? '');
          setProblemDescription(parsed.problemDescription ?? '');
          setResolutionDifficulty(parsed.resolutionDifficulty ?? '');
          setExecutionLog(parsed.executionLog ?? '');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  const fetchNextRequestId = useCallback(async () => {
    if (!id) {
      setNextRequestId(null);
      return;
    }

    setLoadingNext(true);
    try {
      const response = await client.get('/codex/requests');
      const requests = parseCodexRequests(response.data);
      const sorted = [...requests].sort((a, b) => {
        const aDate = new Date(a.createdAt).getTime();
        const bDate = new Date(b.createdAt).getTime();
        if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) {
          return bDate - aDate;
        }
        return b.id - a.id;
      });

      const currentIndex = sorted.findIndex((item) => item.id === Number(id));
      if (currentIndex >= 0 && currentIndex < sorted.length - 1) {
        setNextRequestId(sorted[currentIndex + 1].id);
      } else {
        setNextRequestId(null);
      }
    } catch (err) {
      setNextRequestId(null);
    } finally {
      setLoadingNext(false);
    }
  }, [id]);

  useEffect(() => {
    fetchNextRequestId();
  }, [fetchNextRequestId]);

  useEffect(() => {
    if (!request || isTerminalStatus(request.status)) {
      return undefined;
    }
    const interval = setInterval(() => {
      fetchRequest(true).catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchRequest, request]);

  const statusBadge = useMemo(() => {
    if (!request) return null;
    return (
      <span
        className={`inline-flex items-center rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide ${codexStatusStyles[request.status]}`}
      >
        {formatStatus(request.status)}
      </span>
    );
  }, [request]);

  const handleSaveComment = useCallback(async () => {
    if (!request) return;
    setSavingComment(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.post(`/codex/requests/${request.id}/comment`, {
        comment,
        problemDescription,
        resolutionDifficulty,
        executionLog
      });
      const parsed = parseCodexRequest(response.data);
      if (!parsed) {
        throw new Error('Não foi possível salvar o comentário.');
      }
      setRequest(parsed);
      setComment(parsed.userComment ?? '');
      setProblemDescription(parsed.problemDescription ?? '');
      setResolutionDifficulty(parsed.resolutionDifficulty ?? '');
      setExecutionLog(parsed.executionLog ?? '');
      setFeedbackDirty(false);
      setSuccessMessage('Comentário salvo com sucesso.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingComment(false);
    }
  }, [comment, executionLog, problemDescription, request, resolutionDifficulty]);

  const handleRating = useCallback(
    async (rating: number) => {
      if (!request) return;
      setSavingRating(true);
      setError(null);
      setSuccessMessage(null);
      try {
        const response = await client.post(`/codex/requests/${request.id}/rating`, { rating });
        const parsed = parseCodexRequest(response.data);
        if (parsed) {
          setRequest(parsed);
          setSuccessMessage('Avaliação registrada.');
        } else {
          await fetchRequest();
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setSavingRating(false);
      }
    },
    [fetchRequest, request]
  );

  const ratingStars = useMemo(() => {
    if (!request) return null;
    const currentRating = request.rating ?? 0;
    const isInteractive = request.status === 'COMPLETED';
    if (!isInteractive && currentRating === 0) {
      return <span className="text-slate-500">Sem avaliação</span>;
    }
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = value <= currentRating;
          if (!isInteractive) {
            return (
              <span key={`static-${value}`} className={`text-xl ${filled ? 'text-amber-500' : 'text-slate-400'}`}>
                ★
              </span>
            );
          }
          return (
            <button
              key={`rate-${value}`}
              type="button"
              onClick={() => handleRating(value)}
              disabled={savingRating}
              className="text-xl transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              title={`Avaliar como ${value}`}
            >
              <span className={filled ? 'text-amber-500' : 'text-slate-400'}>★</span>
            </button>
          );
        })}
      </div>
    );
  }, [handleRating, request, savingRating]);

  const handleGoToNext = useCallback(() => {
    if (!nextRequestId) return;
    navigate(`/codex/requests/${nextRequestId}`);
  }, [navigate, nextRequestId]);


  const handleDownloadInteractions = useCallback(async () => {
    if (!request) return;
    setDownloadingInteractions(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.get(`/codex/requests/${request.id}/interactions/download`, {
        responseType: 'blob'
      });
      const contentDisposition = response.headers['content-disposition'];
      const fallbackName = `solicitacao-${request.id}-interacoes.zip`;
      const fileNameMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(contentDisposition ?? '');
      const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1].replace(/"/g, '')) : fallbackName;
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Download das interações iniciado.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadingInteractions(false);
    }
  }, [request]);

  const handleCreatePullRequest = useCallback(async () => {
    if (!request) return;
    setCreatingPr(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await client.post(
        `/codex/requests/${request.id}/create-pr`,
        {},
        {
          headers: {
            'X-Role': 'owner',
            'X-User': 'codex-ui'
          }
        }
      );
      const url = typeof response.data?.url === 'string' ? response.data.url : undefined;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setSuccessMessage(url ? 'Pull Request criado com sucesso.' : 'Pull Request criado.');
      await fetchRequest(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreatingPr(false);
    }
  }, [fetchRequest, request]);

  if (!loading && !request) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Solicitação não encontrada.</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
          <Link to="/codex" className="text-emerald-600 hover:underline">
            Voltar para histórico
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold">Detalhe da solicitação</h2>
            {statusBadge}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Veja o prompt, a resposta, o merge e registre melhorias.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchRequest()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            disabled={loading}
          >
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleGoToNext}
            disabled={!nextRequestId || loadingNext}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            title={nextRequestId ? `Ir para a solicitação ${nextRequestId}` : 'Sem próximas solicitações'}
          >
            {loadingNext ? 'Carregando...' : 'Próximo'}
          </button>
          <Link
            to="/codex"
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Voltar
          </Link>
        </div>
      </div>

      {(error || successMessage) && (
        <div className="space-y-2">
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-900/20 dark:text-red-200">{error}</div>}
          {successMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-200">
              {successMessage}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        {loading && <p className="text-sm text-slate-500">Carregando solicitação...</p>}
        {request && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Solicitação #{request.id}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Criada em {formatDateTime(request.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Perfil: <strong>{formatProfile(request.profile)}</strong>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Modelo: <strong>{request.model}</strong>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Ambiente: <strong>{request.environment}</strong>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  Versão: <strong>{request.version ?? '—'}</strong>
                </div>
              </div>
            </div>

            {request.profile === 'ECO_1' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-100">
                <p className="font-semibold">Modo ECO-1</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Limite o carregamento de instruções fixas usando project_doc_max_bytes e priorize resumos curtos.</li>
                  <li>Trunque e registre saídas de ferramentas antes de enviá-las ao histórico compartilhado.</li>
                  <li>Execute compaction sempre que o histórico se aproximar da janela do modelo e trate imagens inline com orçamentos fixos.</li>
                  <li>Mude para o modelo econômico assim que o nudge de 90% de uso aparecer.</li>
                </ul>
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">Referência: docs/estrategia-token/modo-eco1.md</p>
              </div>
            )}

            {request.profile === 'ECO_2' && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-900 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-100">
                <p className="font-semibold">Modo ECO-2</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Dispara compactações automáticas quando o total_usage_tokens ultrapassa o limite configurado.</li>
                  <li>Executa uma compactação preventiva antes de cada turno e após trocas para modelos com janela menor.</li>
                  <li>Alterna entre compactação local e remota conforme o provedor suportado.</li>
                  <li>Mantém no máximo 20 000 tokens de mensagens de usuário, truncando e registrando excedentes.</li>
                  <li>Poda chamadas de função/tool mais recentes antes de reenviar o histórico resumido.</li>
                  <li>Trunca outputs de ferramentas antes de devolvê-los ao modelo para evitar desperdício.</li>
                </ul>
                <p className="mt-2 text-xs text-slate-600 dark:text-sky-200">Referência: docs/estrategia-token/modo-eco2.md</p>
              </div>
            )}

            {request.profile === 'ECO_3' && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-900/20 dark:text-rose-100">
                <p className="font-semibold">Modo ECO-3</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Converta logs extensos em resumos antes de adicioná-los ao histórico pago.</li>
                  <li>Respeite o teto automático de 120 iterações por tarefa e interrompa loops repetitivos.</li>
                  <li>Acompanhe o contador total de tokens e finalize o fluxo ao se aproximar de 800 mil tokens.</li>
                  <li>Documente sempre que arquivos, comandos ou trechos forem truncados para manter rastreabilidade.</li>
                  <li>Prefira salvar artefatos volumosos em arquivos auxiliares (docs/ ou codex/) e compartilhe apenas os resumos.</li>
                </ul>
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-200">Referência: docs/estrategia-token/modo-eco3.md</p>
              </div>
            )}

            {request.profile === 'CHATGPT_CODEX' && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-slate-900 dark:border-indigo-900/60 dark:bg-indigo-900/20 dark:text-indigo-100">
                <p className="font-semibold">Modo Codex (ChatGPT)</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Trate o fluxo como o command center multiagente do chatgpt.com/codex, registrando squads, owners e metas paralelas.</li>
                  <li>Abra worktrees ou diretórios codex/&lt;squad&gt; para dividir iniciativas e sincronize checkpoints curtos entre elas.</li>
                  <li>Execute verificações rápidas em ambientes em nuvem e compacte logs em relatos objetivos para segurar o custo.</li>
                  <li>Publique checkpoints com progresso, riscos e o custo estimado de cada frente.</li>
                </ul>
                <p className="mt-2 text-xs text-indigo-700 dark:text-indigo-200">Referência: docs/estrategia-token/chatgpt-codex.md</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="Início" value={formatDateTime(request.startedAt ?? request.createdAt)} />
              <InfoItem label="Fim" value={formatDateTime(request.finishedAt)} />
              <InfoItem label="Duração" value={formatDuration(request.durationMs)} />
              <InfoItem label="Timeouts" value={(request.timeoutCount ?? 0).toLocaleString('pt-BR')} />
              <InfoItem label="HTTP GETs (total)" value={(request.httpGetCount ?? 0).toLocaleString('pt-BR')} />
              <InfoItem
                label="HTTP GETs com sucesso"
                value={(request.httpGetSuccessCount ?? 0).toLocaleString('pt-BR')}
              />
              <InfoItem label="Consultas ao banco" value={(request.dbQueryCount ?? 0).toLocaleString('pt-BR')} />
              <InfoItem
                label="Interações com o modelo"
                value={typeof request.interactionCount === 'number' ? request.interactionCount.toLocaleString('pt-BR') : '—'}
              />
              <InfoItem
                label="Problema vinculado"
                value={request.problemTitle ? `#${request.problemId} — ${request.problemTitle}` : '—'}
              />
              <InfoItem
                label="Job no sandbox"
                value={request.externalId ? `ID ${request.externalId}` : '—'}
              />
              <InfoItem
                label="Versão"
                value={request.version ?? '—'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Uso de tokens</h4>
                <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <InfoRow label="Input" value={formatTokens(request.promptTokens)} />
                  <InfoRow label="Input cacheado" value={formatTokens(request.cachedPromptTokens)} />
                  <InfoRow label="Output" value={formatTokens(request.completionTokens)} />
                  <InfoRow label="Total" value={formatTokens(request.totalTokens)} bold />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Custos</h4>
                <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  <InfoRow label="Input" value={formatCost(request.promptCost, 4)} />
                  <InfoRow label="Input cacheado" value={formatCost(request.cachedPromptCost, 4)} />
                  <InfoRow label="Output" value={formatCost(request.completionCost, 4)} />
                  <InfoRow label="Total" value={formatCost(request.cost)} bold />
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Prompt enviado</h4>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleCopyPrompt(request.prompt)}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      Copiar prompt
                    </button>
                    <span className="text-xs text-slate-500">{request.prompt.length.toLocaleString('pt-BR')} caracteres</span>
                  </div>
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-900/90 p-4 text-xs leading-relaxed text-emerald-100">
                  {request.prompt}
                </pre>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Resposta do Codex</h4>
                  <span className="text-xs text-slate-500">
                    {request.responseText ? `${request.responseText.length.toLocaleString('pt-BR')} caracteres` : 'Sem resposta'}
                  </span>
                </div>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-900/90 p-4 text-xs leading-relaxed text-emerald-100">
                  {request.responseText ?? '—'}
                </pre>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Merge / Pull Request</h4>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {request.pullRequestUrl ? (
                    <a
                      href={request.pullRequestUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-emerald-700 underline hover:text-emerald-800"
                    >
                      Abrir merge/pull request
                      <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <p className="text-sm text-slate-500">Nenhum link de merge disponível.</p>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadInteractions}
                    disabled={downloadingInteractions}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {downloadingInteractions ? 'Gerando ZIP...' : 'Baixar interações (.zip)'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePullRequest}
                    disabled={creatingPr}
                    className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {creatingPr ? 'Criando PR...' : 'Criar novo PR no GitHub'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-2 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Avaliação</h4>
                  <span className="text-xs text-slate-500">Disponível após conclusão</span>
                </div>
                <div>{ratingStars}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {request && (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Comentário e melhoria</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">Guarde aprendizados para evoluir o processo.</p>
            </div>
            <Link to={`/codex/requests/${request.id}`} className="text-xs text-slate-500">
              Última atualização: {formatDateTime(request.finishedAt ?? request.createdAt)}
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="problem-description">
                Problema encontrado
              </label>
              <textarea
                id="problem-description"
                value={problemDescription}
                onChange={(event) => {
                  setProblemDescription(event.target.value);
                  setFeedbackDirty(true);
                }}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Descreva o problema, o contexto e o impacto observado."
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Ajuda a entender o motivo da solicitação.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="resolution-difficulty">
                Dificuldade de resolução
              </label>
              <textarea
                id="resolution-difficulty"
                value={resolutionDifficulty}
                onChange={(event) => {
                  setResolutionDifficulty(event.target.value);
                  setFeedbackDirty(true);
                }}
                rows={2}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Baixa, média, alta ou detalhe do que tornou a resolução fácil ou difícil."
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Documente desafios, bloqueios ou facilidades encontrados.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="comment-and-improvement">
                Comentário e melhoria
              </label>
              <textarea
                id="comment-and-improvement"
                value={comment}
                onChange={(event) => {
                  setComment(event.target.value);
                  setFeedbackDirty(true);
                }}
                rows={5}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Anote decisões, problemas encontrados ou ideias para melhorar o fluxo."
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">Guarde aprendizados para evoluir o processo.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="execution-log">
                Log
              </label>
              <textarea
                id="execution-log"
                value={executionLog}
                onChange={(event) => {
                  setExecutionLog(event.target.value);
                  setFeedbackDirty(true);
                }}
                rows={3}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                placeholder="Registre um log ou observação após a solicitação ser executada."
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajuda a documentar ações realizadas e melhorias futuras.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <button
                type="button"
                onClick={handleSaveComment}
                disabled={savingComment}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingComment ? 'Salvando...' : 'Salvar comentário'}
              </button>
              {feedbackDirty && <span className="text-amber-600">Alterações não salvas</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={bold ? 'font-semibold text-slate-800 dark:text-slate-100' : ''}>{value}</span>
    </div>
  );
}
