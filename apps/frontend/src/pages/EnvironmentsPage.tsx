import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

interface Environment {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  dbHost?: string | null;
  dbPort?: number | null;
  dbName?: string | null;
  dbUser?: string | null;
  dbPassword?: string | null;
}

const parsePortOrThrow = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error('Informe uma porta válida entre 1 e 65535.');
  }
  return parsed;
};

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dbHost, setDbHost] = useState('');
  const [dbPort, setDbPort] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationSuccess, setCreationSuccess] = useState<string | null>(null);

  const [editingEnvironment, setEditingEnvironment] = useState<Environment | null>(null);
  const [editDbHost, setEditDbHost] = useState('');
  const [editDbPort, setEditDbPort] = useState('');
  const [editDbName, setEditDbName] = useState('');
  const [editDbUser, setEditDbUser] = useState('');
  const [editDbPassword, setEditDbPassword] = useState('');
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(null);

  useEffect(() => {
    client
      .get<Environment[]>('/environments')
      .then((response) => setEnvironments(response.data))
      .catch((err: Error) => setCreationError(err.message));
  }, []);

  useEffect(() => {
    if (!editingEnvironment) {
      setEditDbHost('');
      setEditDbPort('');
      setEditDbName('');
      setEditDbUser('');
      setEditDbPassword('');
      setConnectionError(null);
      setConnectionSuccess(null);
      return;
    }

    setEditDbHost(editingEnvironment.dbHost ?? '');
    setEditDbPort(editingEnvironment.dbPort ? String(editingEnvironment.dbPort) : '');
    setEditDbName(editingEnvironment.dbName ?? '');
    setEditDbUser(editingEnvironment.dbUser ?? '');
    setEditDbPassword(editingEnvironment.dbPassword ?? '');
    setConnectionError(null);
    setConnectionSuccess(null);
  }, [editingEnvironment]);

  const sortedEnvironments = useMemo(() => {
    return [...environments].sort((a, b) => a.name.localeCompare(b.name));
  }, [environments]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedDbHost = dbHost.trim();
    const trimmedDbName = dbName.trim();
    const trimmedDbUser = dbUser.trim();
    let parsedPort: number | undefined;

    if (!trimmedName) {
      setCreationError('Informe um nome para o ambiente.');
      return;
    }

    try {
      parsedPort = parsePortOrThrow(dbPort);
    } catch (err) {
      setCreationError((err as Error).message);
      return;
    }

    setCreating(true);
    setCreationError(null);
    setCreationSuccess(null);

    try {
      const response = await client.post<Environment>('/environments', {
        name: trimmedName,
        description: trimmedDescription || undefined,
        dbHost: trimmedDbHost || undefined,
        dbPort: parsedPort,
        dbName: trimmedDbName || undefined,
        dbUser: trimmedDbUser || undefined,
        dbPassword: dbPassword.trim() ? dbPassword : undefined
      });
      setEnvironments((prev) => [...prev, response.data]);
      setName('');
      setDescription('');
      setDbHost('');
      setDbPort('');
      setDbName('');
      setDbUser('');
      setDbPassword('');
      setCreationSuccess('Ambiente cadastrado com sucesso.');
    } catch (err) {
      setCreationError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleConnectionSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingEnvironment) {
      return;
    }

    const trimmedHost = editDbHost.trim();
    const trimmedDbName = editDbName.trim();
    const trimmedUser = editDbUser.trim();
    let parsedPort: number | undefined;

    try {
      parsedPort = parsePortOrThrow(editDbPort);
    } catch (err) {
      setConnectionError((err as Error).message);
      return;
    }

    setConnectionLoading(true);
    setConnectionError(null);
    setConnectionSuccess(null);

    try {
      const response = await client.put<Environment>(`/environments/${editingEnvironment.id}`, {
        name: editingEnvironment.name,
        description: editingEnvironment.description ?? undefined,
        dbHost: trimmedHost || undefined,
        dbPort: parsedPort,
        dbName: trimmedDbName || undefined,
        dbUser: trimmedUser || undefined,
        dbPassword: editDbPassword.trim() ? editDbPassword : undefined
      });

      setEnvironments((prev) => prev.map((env) => (env.id === response.data.id ? response.data : env)));
      setEditingEnvironment(response.data);
      setConnectionSuccess('Dados de conexão atualizados com sucesso.');
    } catch (err) {
      setConnectionError((err as Error).message);
    } finally {
      setConnectionLoading(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Ambientes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Cadastre e organize os ambientes disponíveis para os fluxos da plataforma e configure os dados de conexão com MySQL.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="environment-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Nome do ambiente
            </label>
            <input
              id="environment-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Ex.: produção"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="environment-description" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Descrição (opcional)
            </label>
            <textarea
              id="environment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-700 dark:bg-slate-900"
              placeholder="Inclua informações adicionais, como URL, cluster ou responsável."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="environment-db-host" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Host do MySQL (opcional)
              </label>
              <input
                id="environment-db-host"
                value={dbHost}
                onChange={(event) => setDbHost(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="ex.: mysql.internal"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="environment-db-port" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Porta (opcional)
              </label>
              <input
                id="environment-db-port"
                value={dbPort}
                onChange={(event) => setDbPort(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="3306"
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="environment-db-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Nome do database (opcional)
              </label>
              <input
                id="environment-db-name"
                value={dbName}
                onChange={(event) => setDbName(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="ai_hub"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="environment-db-user" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Usuário (opcional)
              </label>
              <input
                id="environment-db-user"
                value={dbUser}
                onChange={(event) => setDbUser(event.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                placeholder="app_user"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="environment-db-password" className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Senha (opcional)
            </label>
            <input
              type="password"
              id="environment-db-password"
              value={dbPassword}
              onChange={(event) => setDbPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Informe uma senha segura"
              autoComplete="new-password"
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {creating ? 'Salvando...' : 'Cadastrar ambiente'}
            </button>
            {creationError && <span className="text-sm text-red-500">{creationError}</span>}
            {creationSuccess && <span className="text-sm text-emerald-600">{creationSuccess}</span>}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold">Ambientes cadastrados</h3>
        <div className="rounded-xl border border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Nome</th>
                <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                <th className="px-4 py-3 text-left font-semibold">Conexão MySQL</th>
                <th className="px-4 py-3 text-left font-semibold">Criado em</th>
                <th className="px-4 py-3 text-left font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {sortedEnvironments.map((environment) => (
                <tr key={environment.id}>
                  <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-100">{environment.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {environment.description ? (
                      <p className="whitespace-pre-line">{environment.description}</p>
                    ) : (
                      <span className="text-slate-400">Sem descrição</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {environment.dbHost ? (
                      <div className="space-y-1">
                        <p className="font-medium text-slate-700 dark:text-slate-100">
                          {environment.dbHost}
                          {environment.dbPort ? `:${environment.dbPort}` : ''}
                        </p>
                        {environment.dbName && (
                          <p className="text-xs text-slate-500">Database: {environment.dbName}</p>
                        )}
                        {environment.dbUser && (
                          <p className="text-xs text-slate-500">Usuário: {environment.dbUser}</p>
                        )}
                        <p className="text-xs text-slate-500">
                          Senha: {environment.dbPassword ? 'definida' : 'não definida'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">Não configurado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                    {new Date(environment.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditingEnvironment(environment)}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Editar conexão
                    </button>
                  </td>
                </tr>
              ))}
              {sortedEnvironments.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-center text-slate-500" colSpan={5}>
                    Nenhum ambiente cadastrado até o momento.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingEnvironment && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-6 dark:border-amber-600/40 dark:bg-amber-900/30">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">Editar conexão MySQL</h3>
              <p className="text-sm text-amber-800 dark:text-amber-100">
                Ambiente selecionado: <span className="font-semibold">{editingEnvironment.name}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingEnvironment(null)}
              className="text-sm font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-100"
            >
              Fechar
            </button>
          </div>

          <form onSubmit={handleConnectionSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="edit-db-host" className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Host
                </label>
                <input
                  id="edit-db-host"
                  value={editDbHost}
                  onChange={(event) => setEditDbHost(event.target.value)}
                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                  placeholder="mysql.internal"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="edit-db-port" className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Porta
                </label>
                <input
                  id="edit-db-port"
                  value={editDbPort}
                  onChange={(event) => setEditDbPort(event.target.value)}
                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                  placeholder="3306"
                  inputMode="numeric"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="edit-db-name" className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Nome do database
                </label>
                <input
                  id="edit-db-name"
                  value={editDbName}
                  onChange={(event) => setEditDbName(event.target.value)}
                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                  placeholder="ai_hub"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="edit-db-user" className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Usuário
                </label>
                <input
                  id="edit-db-user"
                  value={editDbUser}
                  onChange={(event) => setEditDbUser(event.target.value)}
                  className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                  placeholder="app_user"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="edit-db-password" className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Senha
              </label>
              <input
                type="password"
                id="edit-db-password"
                value={editDbPassword}
                onChange={(event) => setEditDbPassword(event.target.value)}
                className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-700 dark:bg-slate-900"
                placeholder="Atualize a senha se necessário"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={connectionLoading}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {connectionLoading ? 'Atualizando...' : 'Salvar alterações'}
              </button>
              <button
                type="button"
                onClick={() => setEditingEnvironment(null)}
                className="text-sm font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-100"
              >
                Cancelar
              </button>
              {connectionError && <span className="text-sm text-red-600">{connectionError}</span>}
              {connectionSuccess && <span className="text-sm text-emerald-700">{connectionSuccess}</span>}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
