import { useFetch } from '../hooks/useFetch';
import client from '../api/client';

interface AuditLog {
  id: number;
  actor: string;
  action: string;
  target?: string;
  payload?: string;
  createdAt: string;
}

export default function AuditLogPage() {
  const { data, loading, error } = useFetch<AuditLog[]>(
    () => client.get('/audit').then((res) => res.data),
    []
  );

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Audit log</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Toda ação confirmada via UI é registrada aqui para rastreabilidade completa.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Quando</th>
              <th className="px-4 py-3 text-left font-semibold">Ator</th>
              <th className="px-4 py-3 text-left font-semibold">Ação</th>
              <th className="px-4 py-3 text-left font-semibold">Alvo</th>
              <th className="px-4 py-3 text-left font-semibold">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-slate-500">
                  Carregando...
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-red-500">
                  {error}
                </td>
              </tr>
            )}
            {data?.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{log.actor}</td>
                <td className="px-4 py-3">{log.action}</td>
                <td className="px-4 py-3">{log.target ?? '—'}</td>
                <td className="px-4 py-3">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
                    {log.payload ?? ''}
                  </pre>
                </td>
              </tr>
            ))}
            {data && data.length === 0 && !loading && !error && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-slate-500">
                  Nenhum registro encontrado
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
