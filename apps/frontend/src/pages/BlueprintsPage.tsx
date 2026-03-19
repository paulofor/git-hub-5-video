import { FormEvent, useState } from 'react';
import client from '../api/client';
import { useFetch } from '../hooks/useFetch';
import ConfirmButton from '../components/ConfirmButton';
import { useToasts } from '../components/ToastContext';

interface Blueprint {
  id: number;
  name: string;
  description: string;
  templates: Record<string, string>;
  createdAt: string;
}

const ownerHeaders = { 'X-Role': 'owner', 'X-User': 'ui-owner' };

export default function BlueprintsPage() {
  const { pushToast } = useToasts();
  const { data, setData, loading, error } = useFetch<Blueprint[]>(
    () => client.get('/blueprints').then((res) => res.data),
    []
  );

  const [form, setForm] = useState({ name: '', description: '', templates: '' });

  const handleSubmit = async () => {
    let templates: Record<string, string> = {};
    if (form.templates.trim()) {
      try {
        templates = JSON.parse(form.templates);
      } catch (err) {
        pushToast('Templates precisam estar em JSON válido', 'error');
        return;
      }
    }
    const response = await client.post(
      '/blueprints',
      { name: form.name, description: form.description, templates },
      { headers: ownerHeaders }
    );
    pushToast('Blueprint criado com sucesso');
    setData([...(data ?? []), response.data]);
    setForm({ name: '', description: '', templates: '' });
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Blueprints</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Configure templates reutilizáveis para stacks completas. Arquivos são carregados via API do GitHub.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold mb-4">Cadastrar blueprint</h3>
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium">Nome</label>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Descrição</label>
              <textarea
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:bg-slate-900 dark:border-slate-700"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Templates (JSON: path → conteúdo)</label>
              <textarea
                value={form.templates}
                onChange={(event) => setForm((prev) => ({ ...prev, templates: event.target.value }))}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-mono dark:bg-slate-900 dark:border-slate-700"
                rows={6}
                placeholder='{"README.md":"# Meu Projeto"}'
              />
            </div>
            <ConfirmButton onConfirm={handleSubmit} label="Preparar" confirmLabel="Confirmar criação" />
          </form>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 p-5">
          <h3 className="text-lg font-semibold mb-4">Catálogo</h3>
          {loading && <p className="text-sm text-slate-500">Carregando...</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <ul className="space-y-4">
            {data?.map((blueprint) => (
              <li key={blueprint.id} className="rounded border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{blueprint.name}</h4>
                    <p className="text-xs text-slate-500">Criado em {new Date(blueprint.createdAt).toLocaleString()}</p>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{blueprint.description}</p>
                {Object.keys(blueprint.templates || {}).length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-emerald-600">Ver arquivos</summary>
                    <div className="mt-2 space-y-2">
                      {Object.entries(blueprint.templates).map(([path, content]) => (
                        <div key={path}>
                          <p className="font-medium">{path}</p>
                          <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-900/90 p-2 text-[11px] text-emerald-100">
                            {content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </li>
            )) ?? <li className="text-sm text-slate-500">Nenhum blueprint cadastrado</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
