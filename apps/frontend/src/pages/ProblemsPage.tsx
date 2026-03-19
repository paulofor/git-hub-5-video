import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { formatCost } from '../lib/codex';

interface ProblemUpdate {
  id: number;
  entryDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface Problem {
  id: number;
  title: string;
  description: string;
  includedAt: string;
  environmentId?: number | null;
  environmentName?: string | null;
  projectId?: number | null;
  projectName?: string | null;
  totalCost?: number | null;
  dailyUpdates: ProblemUpdate[];
  finalizationDescription?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EnvironmentOption {
  id: number;
  name: string;
}

interface ProjectOption {
  id: number;
  repo: string;
}

interface UpdateInput {
  key: string;
  entryDate: string;
  description: string;
}

const sortProblems = (items: Problem[]) => {
  return [...items].sort((a, b) => {
    const includedDiff = new Date(b.includedAt).getTime() - new Date(a.includedAt).getTime();
    if (includedDiff !== 0) {
      return includedDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString('pt-BR');
};

export default function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIncludedAt, setFormIncludedAt] = useState('');
  const [formEnvironmentId, setFormEnvironmentId] = useState('');
  const [formProjectId, setFormProjectId] = useState('');
  const [formFinalizationDescription, setFormFinalizationDescription] = useState('');
  const [formFinalizedAt, setFormFinalizedAt] = useState('');
  const [updates, setUpdates] = useState<UpdateInput[]>([]);
  const updateCounter = useRef(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    client
      .get<Problem[]>('/problems')
      .then((response) => setProblems(sortProblems(response.data)))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    client
      .get<EnvironmentOption[]>('/environments')
      .then((response) => setEnvironments(response.data))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    client
      .get<ProjectOption[]>('/projects')
      .then((response) => setProjects(response.data))
      .catch(() => undefined);
  }, []);

  const addEmptyUpdate = () => {
    updateCounter.current += 1;
    setUpdates((prev) => [...prev, { key: `new-${updateCounter.current}`, entryDate: '', description: '' }]);
  };

  const handleUpdateChange = (key: string, field: keyof UpdateInput, value: string) => {
    setUpdates((prev) => prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)));
  };

  const handleRemoveUpdate = (key: string) => {
    setUpdates((prev) => prev.filter((item) => item.key !== key));
  };

  const resetForm = () => {
    setFormTitle('');
    setFormDescription('');
    setFormIncludedAt('');
    setFormEnvironmentId('');
    setFormProjectId('');
    setFormFinalizationDescription('');
    setFormFinalizedAt('');
    setUpdates([]);
    setEditingProblem(null);
  };

  const handleEdit = (problem: Problem) => {
    setEditingProblem(problem);
    setFormTitle(problem.title);
    setFormDescription(problem.description);
    setFormIncludedAt(problem.includedAt);
    setFormEnvironmentId(problem.environmentId ? String(problem.environmentId) : '');
    setFormProjectId(problem.projectId ? String(problem.projectId) : '');
    setFormFinalizationDescription(problem.finalizationDescription ?? '');
    setFormFinalizedAt(problem.finalizedAt ?? '');
    setUpdates(
      problem.dailyUpdates.map((item) => ({
        key: `existing-${item.id}`,
        entryDate: item.entryDate,
        description: item.description
      }))
    );
    setFormError(null);
    setFormSuccess(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = formTitle.trim();
    const trimmedDescription = formDescription.trim();
    const trimmedFinalization = formFinalizationDescription.trim();
    const environmentId = formEnvironmentId ? Number(formEnvironmentId) : undefined;
    const projectId = formProjectId ? Number(formProjectId) : undefined;

    if (!trimmedTitle || !trimmedDescription || !formIncludedAt) {
      setFormError('Informe título, descrição e a data de inclusão.');
      return;
    }

    if (!environmentId && !projectId) {
      setFormError('Associe o problema a um ambiente ou projeto.');
      return;
    }

    const dailyUpdates = updates
      .filter((item) => item.entryDate && item.description.trim())
      .map((item) => ({
        entryDate: item.entryDate,
        description: item.description.trim()
      }));

    const payload = {
      title: trimmedTitle,
      description: trimmedDescription,
      includedAt: formIncludedAt,
      environmentId,
      projectId,
      dailyUpdates,
      finalizationDescription: trimmedFinalization || undefined,
      finalizedAt: formFinalizedAt || undefined
    };

    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      if (editingProblem) {
        const response = await client.put<Problem>(`/problems/${editingProblem.id}`, payload);
        const updated = response.data;
        setProblems((prev) =>
          sortProblems(prev.map((problem) => (problem.id === updated.id ? updated : problem)))
        );
        setFormSuccess('Problema atualizado com sucesso.');
        setEditingProblem(updated);
        setFormTitle(updated.title);
        setFormDescription(updated.description);
        setFormIncludedAt(updated.includedAt);
        setFormEnvironmentId(updated.environmentId ? String(updated.environmentId) : '');
        setFormProjectId(updated.projectId ? String(updated.projectId) : '');
        setFormFinalizationDescription(updated.finalizationDescription ?? '');
        setFormFinalizedAt(updated.finalizedAt ?? '');
        setUpdates(
          updated.dailyUpdates.map((item) => ({ key: `existing-${item.id}`, entryDate: item.entryDate, description: item.description }))
        );
      } else {
        const response = await client.post<Problem>('/problems', payload);
        setProblems((prev) => sortProblems([...prev, response.data]));
        setFormSuccess('Problema cadastrado com sucesso.');
        resetForm();
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalOpenProblems = useMemo(() => problems.filter((problem) => !problem.finalizedAt).length, [problems]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Problemas</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Registre e acompanhe problemas críticos vinculados a ambientes e projetos, incluindo o histórico diário de evolução e a
            data de finalização.
          </p>
        </div>
        <div className="text-right text-sm text-slate-500 dark:text-slate-400">
          <p>Problemas em aberto: {totalOpenProblems}</p>
          <p>Total cadastrados: {problems.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Título</label>
              <input
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="Ex.: Erro de sincronização no ambiente de staging"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Descrição</label>
              <textarea
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                className="h-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
                placeholder="Descreva o contexto do problema"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Data de inclusão</label>
                <input
                  type="date"
                  value={formIncludedAt}
                  onChange={(event) => setFormIncludedAt(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Data de finalização</label>
                <input
                  type="date"
                  value={formFinalizedAt}
                  onChange={(event) => setFormFinalizedAt(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Ambiente</label>
                <select
                  value={formEnvironmentId}
                  onChange={(event) => setFormEnvironmentId(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Selecione</option>
                  {environments.map((environment) => (
                    <option key={environment.id} value={environment.id}>
                      {environment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Projeto</label>
                <select
                  value={formProjectId}
                  onChange={(event) => setFormProjectId(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Selecione</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.repo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Descrição da finalização</label>
              <textarea
                value={formFinalizationDescription}
                onChange={(event) => setFormFinalizationDescription(event.target.value)}
                className="h-24 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
                placeholder="Detalhe como o problema foi encerrado"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Atualizações diárias</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Registre os avanços com data e descrição.</p>
                </div>
                <button
                  type="button"
                  onClick={addEmptyUpdate}
                  className="rounded-md border border-emerald-600 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                >
                  Adicionar atualização
                </button>
              </div>

              {updates.length === 0 && (
                <p className="text-xs text-slate-500">Nenhuma atualização adicionada.</p>
              )}

              <div className="space-y-3">
                {updates.map((update) => (
                  <div key={update.key} className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Data</label>
                        <input
                          type="date"
                          value={update.entryDate}
                          onChange={(event) => handleUpdateChange(update.key, 'entryDate', event.target.value)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                      </div>
                      <div className="md:col-span-2 flex flex-col gap-1">
                        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descrição</label>
                        <textarea
                          value={update.description}
                          onChange={(event) => handleUpdateChange(update.key, 'description', event.target.value)}
                          className="h-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-900"
                        />
                      </div>
                    </div>
                    <div className="mt-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveUpdate(update.key)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {formError && <p className="text-sm text-red-500">{formError}</p>}
            {formSuccess && <p className="text-sm text-emerald-600">{formSuccess}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {editingProblem ? 'Atualizar problema' : 'Cadastrar problema'}
              </button>
              {editingProblem && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setFormError(null);
                    setFormSuccess(null);
                  }}
                  className="text-sm font-medium text-slate-600 hover:underline dark:text-slate-300"
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          {loading && <p className="text-sm text-slate-500">Carregando problemas...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && problems.length === 0 && <p className="text-sm text-slate-500">Nenhum problema cadastrado.</p>}

          <div className="space-y-4">
            {problems.map((problem) => (
              <article key={problem.id} className="rounded-lg border border-slate-200 p-4 shadow-sm dark:border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{problem.title}</h3>
                    <p className="text-xs text-slate-500">Incluído em {formatDate(problem.includedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/problems/${problem.id}`}
                      className="text-sm font-medium text-sky-600 hover:underline dark:text-sky-400"
                    >
                      Detalhar
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleEdit(problem)}
                      className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                    >
                      Editar
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{problem.description}</p>

                <dl className="mt-3 grid grid-cols-1 gap-3 text-xs text-slate-500 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Ambiente</dt>
                    <dd>{problem.environmentName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Projeto</dt>
                    <dd>{problem.projectName ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Gasto acumulado</dt>
                    <dd>{problem.totalCost != null ? formatCost(problem.totalCost, 4) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Finalizado em</dt>
                    <dd>{formatDate(problem.finalizedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Última atualização</dt>
                    <dd>{new Date(problem.updatedAt).toLocaleString('pt-BR')}</dd>
                  </div>
                </dl>

                {problem.dailyUpdates.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Evolução diária</p>
                    <ul className="mt-2 space-y-2">
                      {problem.dailyUpdates.map((item) => (
                        <li key={item.id} className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-semibold">{formatDate(item.entryDate)}:</span> {item.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {problem.finalizationDescription && (
                  <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                    <p className="font-semibold">Resumo da finalização</p>
                    <p className="mt-1 text-xs leading-relaxed">{problem.finalizationDescription}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
