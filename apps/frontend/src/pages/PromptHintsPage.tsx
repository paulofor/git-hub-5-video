import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import ConfirmButton from '../components/ConfirmButton';

interface PromptHintRecord {
  id: number;
  label: string;
  phrase: string;
  environmentId?: number | null;
  environmentName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EnvironmentOption {
  id: number;
  name: string;
}

const sortPromptHints = (items: PromptHintRecord[]) => {
  return [...items].sort((a, b) => {
    const aIsGlobal = !a.environmentId;
    const bIsGlobal = !b.environmentId;
    if (aIsGlobal && bIsGlobal) {
      return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
    }
    if (aIsGlobal) {
      return -1;
    }
    if (bIsGlobal) {
      return 1;
    }
    const envCompare = (a.environmentName ?? '').localeCompare(b.environmentName ?? '', 'pt-BR', {
      sensitivity: 'base'
    });
    if (envCompare !== 0) {
      return envCompare;
    }
    return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
  });
};

export default function PromptHintsPage() {
  const [promptHints, setPromptHints] = useState<PromptHintRecord[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formPhrase, setFormPhrase] = useState('');
  const [formEnvironmentId, setFormEnvironmentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [editingHint, setEditingHint] = useState<PromptHintRecord | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    client
      .get<PromptHintRecord[]>('/prompt-hints')
      .then((response) => {
        setPromptHints(sortPromptHints(response.data));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    client
      .get<EnvironmentOption[]>('/environments')
      .then((response) => setEnvironments(response.data))
      .catch(() => undefined);
  }, []);

  const resetForm = () => {
    setFormLabel('');
    setFormPhrase('');
    setFormEnvironmentId('');
    setEditingHint(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedLabel = formLabel.trim();
    const trimmedPhrase = formPhrase.trim();
    const environmentId = formEnvironmentId ? Number(formEnvironmentId) : undefined;

    if (!trimmedLabel || !trimmedPhrase) {
      setFormError('Informe o nome do item e a frase que será adicionada ao prompt.');
      return;
    }

    setSaving(true);
    setFormError(null);
    setFormSuccess(null);

    const payload = {
      label: trimmedLabel,
      phrase: trimmedPhrase,
      environmentId
    };

    try {
      if (editingHint) {
        const response = await client.put<PromptHintRecord>(`/prompt-hints/${editingHint.id}`, payload);
        setPromptHints((prev) =>
          sortPromptHints(prev.map((hint) => (hint.id === response.data.id ? response.data : hint)))
        );
        setFormSuccess('Item atualizado com sucesso.');
      } else {
        const response = await client.post<PromptHintRecord>('/prompt-hints', payload);
        setPromptHints((prev) => sortPromptHints([...prev, response.data]));
        setFormSuccess('Item cadastrado com sucesso.');
      }
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (hint: PromptHintRecord) => {
    setEditingHint(hint);
    setFormLabel(hint.label);
    setFormPhrase(hint.phrase);
    setFormEnvironmentId(hint.environmentId ? String(hint.environmentId) : '');
    setFormError(null);
    setFormSuccess(null);
  };

  const handleDelete = async (hintId: number) => {
    setError(null);
    try {
      await client.delete(`/prompt-hints/${hintId}`);
      setPromptHints((prev) => prev.filter((hint) => hint.id !== hintId));
      if (editingHint?.id === hintId) {
        resetForm();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const totalGlobalHints = useMemo(() => promptHints.filter((hint) => !hint.environmentId).length, [promptHints]);
  const totalScopedHints = promptHints.length - totalGlobalHints;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Itens opcionais do prompt</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Cadastre frases reutilizáveis para complementar o prompt antes de enviar tarefas ao Codex. É possível manter itens gerais
            (válidos para todos os ambientes) e itens específicos de cada ambiente.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
          <p>Itens gerais: {totalGlobalHints}</p>
          <p>Itens por ambiente: {totalScopedHints}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="prompt-hint-label" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Nome do item
            </label>
            <input
              id="prompt-hint-label"
              value={formLabel}
              onChange={(event) => setFormLabel(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Ex.: Banco de dados"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="prompt-hint-phrase" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Frase adicionada ao prompt
            </label>
            <textarea
              id="prompt-hint-phrase"
              value={formPhrase}
              onChange={(event) => setFormPhrase(event.target.value)}
              className="h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
              placeholder="Ex.: use a tool de banco de dados para pesquisar as informações necessárias"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="prompt-hint-environment" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Ambiente associado (opcional)
            </label>
            <select
              id="prompt-hint-environment"
              value={formEnvironmentId}
              onChange={(event) => setFormEnvironmentId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Todos os ambientes</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Salvando...' : editingHint ? 'Atualizar item' : 'Cadastrar item'}
            </button>
            {editingHint && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancelar edição
              </button>
            )}
            {formError && <span className="text-sm text-red-500">{formError}</span>}
            {formSuccess && <span className="text-sm text-emerald-600">{formSuccess}</span>}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Itens cadastrados</h3>
        <div className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nome</th>
                <th className="px-4 py-3 text-left font-semibold">Escopo</th>
                <th className="px-4 py-3 text-left font-semibold">Frase</th>
                <th className="px-4 py-3 text-left font-semibold">Atualizado em</th>
                <th className="px-4 py-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-slate-500">
                    Carregando itens cadastrados...
                  </td>
                </tr>
              )}
              {error && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              )}
              {!loading && !error && promptHints.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-slate-500">
                    Nenhum item cadastrado até o momento.
                  </td>
                </tr>
              )}
              {!loading && !error && promptHints.map((hint) => (
                <tr key={hint.id}>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{hint.label}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-300">
                    {hint.environmentName ?? 'Todos os ambientes'}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    <pre className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{hint.phrase}</pre>
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(hint.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(hint)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Editar
                      </button>
                      <ConfirmButton
                        onConfirm={() => handleDelete(hint.id)}
                        label="Excluir"
                        confirmLabel="Confirmar exclusão"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
