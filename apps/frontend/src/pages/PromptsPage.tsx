import { useMemo, useState } from 'react';
import { useFetch } from '../hooks/useFetch';
import client from '../api/client';

interface PromptRecord {
  id: number;
  repo: string;
  runId?: number;
  prNumber?: number;
  model: string;
  prompt: string;
  createdAt: string;
}

export default function PromptsPage() {
  const { data, loading, error } = useFetch<PromptRecord[]>(
    () => client.get('/prompts').then((res) => res.data),
    []
  );
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    return data.filter(
      (prompt) =>
        prompt.repo.toLowerCase().includes(q) ||
        prompt.prompt.toLowerCase().includes(q) ||
        prompt.model.toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Prompts</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Histórico de interações com a OpenAI Responses API. Dados sensíveis são redigidos antes do envio.
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por repositório ou conteúdo"
          className="w-80 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Repositório</th>
              <th className="px-4 py-3 text-left font-semibold">Modelo</th>
              <th className="px-4 py-3 text-left font-semibold">Criado</th>
              <th className="px-4 py-3 text-left font-semibold">Prompt</th>
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
            {filtered.map((prompt) => (
              <tr key={prompt.id}>
                <td className="px-4 py-3 font-medium">{prompt.repo}</td>
                <td className="px-4 py-3">{prompt.model}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(prompt.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <details>
                    <summary className="cursor-pointer text-emerald-600">Ver prompt</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-900/90 p-3 text-xs text-emerald-100">
                      {prompt.prompt}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-slate-500">
                  Nenhum prompt encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
