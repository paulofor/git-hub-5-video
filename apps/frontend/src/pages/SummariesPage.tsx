import { useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import client from '../api/client';
import ConfirmButton from '../components/ConfirmButton';
import { useToasts } from '../components/ToastContext';

interface SummaryRecord {
  id: number;
  repo?: string;
  rangeStart: string;
  rangeEnd: string;
  granularity: string;
  content: string;
  createdAt: string;
}

const ownerHeaders = { 'X-Role': 'owner', 'X-User': 'ui-owner' };

export default function SummariesPage() {
  const { data, setData, loading, error } = useFetch<SummaryRecord[]>(
    () => client.get('/summaries').then((res) => res.data),
    []
  );
  const { pushToast } = useToasts();
  const [form, setForm] = useState({ repo: '', rangeStart: '', rangeEnd: '', granularity: 'semanal' });

  const generate = async () => {
    if (!form.rangeStart || !form.rangeEnd) {
      pushToast('Informe início e fim do período', 'error');
      return;
    }
    const response = await client.post('/summaries/generate', form, { headers: ownerHeaders });
    setData([response.data, ...(data ?? [])]);
    pushToast('Resumo gerado');
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Summaries</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Gere relatórios periódicos sobre falhas e correções. Tudo fica registrado para auditoria.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-5 space-y-4">
        <h3 className="text-lg font-semibold">Gerar resumo manual</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4 text-sm">
          <div>
            <label className="block text-xs font-medium">Repositório (opcional)</label>
            <input
              value={form.repo}
              onChange={(event) => setForm((prev) => ({ ...prev, repo: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:bg-slate-900 dark:border-slate-700"
              placeholder="org/repo"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Início</label>
            <input
              type="date"
              value={form.rangeStart}
              onChange={(event) => setForm((prev) => ({ ...prev, rangeStart: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:bg-slate-900 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Fim</label>
            <input
              type="date"
              value={form.rangeEnd}
              onChange={(event) => setForm((prev) => ({ ...prev, rangeEnd: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:bg-slate-900 dark:border-slate-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Granularidade</label>
            <select
              value={form.granularity}
              onChange={(event) => setForm((prev) => ({ ...prev, granularity: event.target.value }))}
              className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 dark:bg-slate-900 dark:border-slate-700"
            >
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </div>
        </div>
        <ConfirmButton
          onConfirm={generate}
          label="Preparar resumo"
          confirmLabel="Confirmar geração"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Período</th>
              <th className="px-4 py-3 text-left font-semibold">Repo</th>
              <th className="px-4 py-3 text-left font-semibold">Granularidade</th>
              <th className="px-4 py-3 text-left font-semibold">Conteúdo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-red-500">
                  {error}
                </td>
              </tr>
            )}
            {data?.map((summary) => (
              <tr key={summary.id}>
                <td className="px-4 py-3">
                  {new Date(summary.rangeStart).toLocaleDateString()} - {new Date(summary.rangeEnd).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">{summary.repo ?? 'Todos'}</td>
                <td className="px-4 py-3">{summary.granularity}</td>
                <td className="px-4 py-3">
                  <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
                    {summary.content}
                  </pre>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-slate-500">
                  Nenhum resumo disponível
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
