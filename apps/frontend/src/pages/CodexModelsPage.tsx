import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

interface CodexModel {
  id: number;
  modelName: string;
  displayName?: string | null;
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  outputPricePerMillion: number;
  createdAt: string;
  updatedAt?: string | null;
}

interface FormState {
  modelName: string;
  displayName: string;
  inputPricePerMillion: string;
  cachedInputPricePerMillion: string;
  outputPricePerMillion: string;
}

const initialFormState: FormState = {
  modelName: '',
  displayName: '',
  inputPricePerMillion: '',
  cachedInputPricePerMillion: '',
  outputPricePerMillion: ''
};

const parsePrice = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(value);
};

export default function CodexModelsPage() {
  const [models, setModels] = useState<CodexModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<number | null>(null);

  const loadModels = () => {
    setLoading(true);
    setError(null);
    client
      .get<CodexModel[]>('/codex/models')
      .then((response) => setModels(response.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadModels();
  }, []);

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [models]);

  const resetForm = () => {
    setForm(initialFormState);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const modelName = form.modelName.trim();
    if (!modelName) {
      setError('Informe o nome do modelo.');
      return;
    }

    const inputPrice = parsePrice(form.inputPricePerMillion);
    const cachedInputPrice = parsePrice(form.cachedInputPricePerMillion);
    const outputPrice = parsePrice(form.outputPricePerMillion);

    if (inputPrice === null || cachedInputPrice === null || outputPrice === null) {
      setError('Informe valores numéricos válidos para os preços.');
      return;
    }

    const payload = {
      modelName,
      displayName: form.displayName.trim() || undefined,
      inputPricePerMillion: inputPrice,
      cachedInputPricePerMillion: cachedInputPrice,
      outputPricePerMillion: outputPrice
    };

    setSaving(true);
    try {
      if (editingId) {
        await client.put(`/codex/models/${editingId}`, payload);
        setSuccessMessage('Modelo atualizado com sucesso.');
      } else {
        await client.post('/codex/models', payload);
        setSuccessMessage('Modelo cadastrado com sucesso.');
      }
      resetForm();
      loadModels();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (model: CodexModel) => {
    setEditingId(model.id);
    setForm({
      modelName: model.modelName,
      displayName: model.displayName ?? '',
      inputPricePerMillion: model.inputPricePerMillion.toString(),
      cachedInputPricePerMillion: model.cachedInputPricePerMillion.toString(),
      outputPricePerMillion: model.outputPricePerMillion.toString()
    });
    setSuccessMessage(null);
    setError(null);
  };

  const handleDelete = async (model: CodexModel) => {
    if (!window.confirm(`Deseja remover o modelo ${model.modelName}?`)) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    try {
      await client.delete(`/codex/models/${model.id}`);
      setSuccessMessage('Modelo removido com sucesso.');
      if (editingId === model.id) {
        resetForm();
      }
      loadModels();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Modelos do Codex</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cadastre e mantenha os valores de cobrança por 1 milhão de tokens para cada modelo disponível.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
            <h3 className="text-lg font-semibold">Modelos cadastrados</h3>
            {loading && <span className="text-sm text-slate-500">Carregando...</span>}
          </div>
          {error && (
            <div className="px-6 pt-4 text-sm text-red-500">{error}</div>
          )}
          {successMessage && (
            <div className="px-6 pt-4 text-sm text-emerald-600">{successMessage}</div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Modelo</th>
                  <th className="px-4 py-3 text-left font-semibold">Nome Exibido</th>
                  <th className="px-4 py-3 text-right font-semibold">Input (1M)</th>
                  <th className="px-4 py-3 text-right font-semibold">Input Cacheado (1M)</th>
                  <th className="px-4 py-3 text-right font-semibold">Output (1M)</th>
                  <th className="px-4 py-3 text-left font-semibold">Atualizado em</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {sortedModels.map((model) => (
                  <tr key={model.id}>
                    <td className="px-4 py-3 font-mono text-xs uppercase text-slate-600 dark:text-slate-300">
                      {model.modelName}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                      {model.displayName || '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {formatCurrency(model.inputPricePerMillion)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {formatCurrency(model.cachedInputPricePerMillion)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">
                      {formatCurrency(model.outputPricePerMillion)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {model.updatedAt
                        ? new Date(model.updatedAt).toLocaleString()
                        : new Date(model.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(model)}
                          className="rounded-md border border-emerald-500 px-3 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/40"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(model)}
                          className="rounded-md border border-red-500 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/40"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && sortedModels.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-sm text-slate-500" colSpan={7}>
                      Nenhum modelo cadastrado até o momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <h3 className="text-lg font-semibold">
            {editingId ? 'Editar modelo' : 'Cadastrar novo modelo'}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Informe os valores em dólares americanos para cada 1 milhão de tokens.
          </p>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                Identificador do modelo
                <input
                  type="text"
                  value={form.modelName}
                  onChange={(event) => setForm((prev) => ({ ...prev, modelName: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="ex: gpt-4.1-mini"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="space-y-2">
              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                Nome exibido (opcional)
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  placeholder="ex: GPT-4.1 Mini"
                  disabled={saving}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                Preço de Input (USD / 1M tokens)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.inputPricePerMillion}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, inputPricePerMillion: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  disabled={saving}
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                Preço de Input Cacheado (USD / 1M tokens)
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.cachedInputPricePerMillion}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, cachedInputPricePerMillion: event.target.value }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                  disabled={saving}
                />
              </label>
            </div>

            <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
              Preço de Output (USD / 1M tokens)
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.outputPricePerMillion}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, outputPricePerMillion: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                disabled={saving}
              />
            </label>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {saving ? 'Salvando...' : editingId ? 'Atualizar modelo' : 'Cadastrar modelo'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  disabled={saving}
                >
                  Cancelar edição
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
