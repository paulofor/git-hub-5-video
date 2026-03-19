import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../api/client';
import { formatDateTime, formatStatus } from '../lib/codex';

interface Problem {
  id: number;
  title: string;
  description: string;
  includedAt: string;
  finalizedAt?: string | null;
  updatedAt: string;
}

interface ProblemRequestHistoryItem {
  id: number;
  environment: string;
  model: string;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  prompt: string;
  responseText?: string | null;
  userComment?: string | null;
  problemDescription?: string | null;
  resolutionDifficulty?: string | null;
  createdAt: string;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString('pt-BR');
};

export default function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [history, setHistory] = useState<ProblemRequestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('Problema inválido.');
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [problemResponse, historyResponse] = await Promise.all([
          client.get<Problem>(`/problems/${id}`),
          client.get<ProblemRequestHistoryItem[]>(`/problems/${id}/requests`)
        ]);
        setProblem(problemResponse.data);
        setHistory(historyResponse.data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [id]);

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [history]
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Detalhes do problema</h2>
          {problem && <p className="text-sm text-slate-600 dark:text-slate-300">{problem.title}</p>}
        </div>
        <Link to="/problems" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          Voltar para problemas
        </Link>
      </div>

      {loading && <p className="text-sm text-slate-500">Carregando histórico do problema...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && !error && problem && (
        <>
          <article className="rounded-lg border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{problem.title}</h3>
            <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{problem.description}</p>
            <dl className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-500 sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Incluído em</dt>
                <dd>{formatDate(problem.includedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Finalizado em</dt>
                <dd>{formatDate(problem.finalizedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-600 dark:text-slate-300">Última atualização</dt>
                <dd>{formatDateTime(problem.updatedAt)}</dd>
              </div>
            </dl>
          </article>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Solicitações relacionadas (mais recentes primeiro)</h3>

            {sortedHistory.length === 0 && (
              <p className="text-sm text-slate-500">Nenhuma solicitação vinculada a este problema.</p>
            )}

            {sortedHistory.map((item) => (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Solicitação #{item.id}</p>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {item.status ? formatStatus(item.status) : '—'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Criada em {formatDateTime(item.createdAt)}</p>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="font-semibold">Ambiente:</span> {item.environment || '—'} · <span className="font-semibold">Modelo:</span>{' '}
                  {item.model || '—'}
                </p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="font-semibold">Resumo do prompt:</span> {item.prompt}
                </p>
                {item.userComment && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Comentário:</span> {item.userComment}
                  </p>
                )}
                {item.problemDescription && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Descrição do problema:</span> {item.problemDescription}
                  </p>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
