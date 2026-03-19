import { FormEvent, useEffect, useMemo, useState } from 'react';
import client from '../api/client';

interface Environment {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
}

interface EnvironmentContainer {
  id: number;
  environmentId: number;
  name: string;
  ipAddress: string;
  port: number;
  source: 'MANUAL' | 'DISCOVERED';
  containerIdentifier?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DiscoveryResponse {
  provider: string;
  executedAt: string;
  discovered: number;
  saved: number;
  skipped: number;
  containers: EnvironmentContainer[];
}

export default function LogInterpreterPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [containers, setContainers] = useState<EnvironmentContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResponse | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('');
  const [creating, setCreating] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSuccess, setManualSuccess] = useState<string | null>(null);

  useEffect(() => {
    client
      .get<Environment[]>('/environments')
      .then((response) => {
        const sorted = [...response.data].sort((a, b) => a.name.localeCompare(b.name));
        setEnvironments(sorted);
        if (sorted.length > 0) {
          setSelectedEnvironment(sorted[0]);
        }
      })
      .catch((err: Error) => setGlobalError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedEnvironment) {
      setContainers([]);
      return;
    }
    setLoadingContainers(true);
    setGlobalError(null);
    setDiscoveryResult(null);
    client
      .get<EnvironmentContainer[]>(`/environments/${selectedEnvironment.id}/containers`)
      .then((response) => setContainers(response.data))
      .catch((err: Error) => setGlobalError(err.message))
      .finally(() => setLoadingContainers(false));
  }, [selectedEnvironment]);

  const selectedEnvironmentId = selectedEnvironment?.id;

  const sortedContainers = useMemo(() => {
    return [...containers].sort((a, b) => a.name.localeCompare(b.name));
  }, [containers]);

  const handleManualSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setManualError(null);
    setManualSuccess(null);

    if (!selectedEnvironmentId) {
      setManualError('Selecione um ambiente para cadastrar containers.');
      return;
    }

    const trimmedName = manualName.trim();
    const trimmedIp = manualIp.trim();
    const trimmedPort = manualPort.trim();

    if (!trimmedName || !trimmedIp || !trimmedPort) {
      setManualError('Informe nome, IP/hostname e porta.');
      return;
    }

    const parsedPort = Number(trimmedPort);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setManualError('Informe uma porta válida entre 1 e 65535.');
      return;
    }

    setCreating(true);
    try {
      const response = await client.post<EnvironmentContainer>(`/environments/${selectedEnvironmentId}/containers`, {
        name: trimmedName,
        ipAddress: trimmedIp,
        port: parsedPort
      });
      setContainers((prev) => [...prev, response.data]);
      setManualName('');
      setManualIp('');
      setManualPort('');
      setManualSuccess('Container cadastrado com sucesso.');
    } catch (err) {
      setManualError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (containerId: number) => {
    if (!selectedEnvironmentId) {
      return;
    }
    const confirmation = window.confirm('Deseja realmente remover este container do ambiente?');
    if (!confirmation) {
      return;
    }
    setDeleteLoadingId(containerId);
    try {
      await client.delete(`/environments/${selectedEnvironmentId}/containers/${containerId}`);
      setContainers((prev) => prev.filter((container) => container.id !== containerId));
    } catch (err) {
      setGlobalError((err as Error).message);
    } finally {
      setDeleteLoadingId(null);
    }
  };

  const handleDiscovery = async () => {
    if (!selectedEnvironmentId) {
      return;
    }
    setDiscoveryLoading(true);
    setGlobalError(null);
    try {
      const response = await client.post<DiscoveryResponse>(`/environments/${selectedEnvironmentId}/containers/discover`, {});
      setDiscoveryResult(response.data);
      setContainers(response.data.containers);
    } catch (err) {
      setGlobalError((err as Error).message);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const renderContainerSource = (source: 'MANUAL' | 'DISCOVERED') => {
    if (source === 'MANUAL') {
      return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Manual</span>;
    }
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Automático</span>;
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold">Interpretador de Logs</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Vincule containers aos ambientes para permitir consultas rápidas de logs e identifique automaticamente novos serviços disponíveis.
        </p>
      </header>

      {globalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          {globalError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">Ambientes disponíveis</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecione um ambiente para gerenciar os containers vinculados.</p>
          </div>
          <div className="space-y-2">
            {environments.map((environment) => (
              <button
                key={environment.id}
                type="button"
                onClick={() => setSelectedEnvironment(environment)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-medium transition ${
                  selectedEnvironment?.id === environment.id
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                }`}
              >
                <span className="block text-base">{environment.name}</span>
                {environment.description && (
                  <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">{environment.description}</span>
                )}
              </button>
            ))}
            {environments.length === 0 && (
              <p className="text-sm text-slate-500">
                Nenhum ambiente cadastrado. Utilize a aba “Ambientes” para criar o primeiro registro.
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {selectedEnvironment ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{selectedEnvironment.name}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-300">
                      {selectedEnvironment.description || 'Nenhuma descrição cadastrada para este ambiente.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscovery}
                    disabled={discoveryLoading}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {discoveryLoading ? 'Sincronizando...' : 'Descobrir containers'}
                  </button>
                </div>
                {discoveryResult && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100">
                    <p className="font-semibold">Sincronização concluída ({new Date(discoveryResult.executedAt).toLocaleString()})</p>
                    <p className="text-xs">
                      Provider: {discoveryResult.provider} | Encontrados: {discoveryResult.discovered} | Salvos:{' '}
                      {discoveryResult.saved} | Ignorados: {discoveryResult.skipped}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-semibold">Containers vinculados</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-300">{sortedContainers.length} registros encontrados.</p>
                  </div>
                </div>
                {loadingContainers ? (
                  <p className="text-sm text-slate-500">Carregando containers...</p>
                ) : sortedContainers.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum container cadastrado para este ambiente.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                      <thead>
                        <tr className="text-left">
                          <th className="px-4 py-2 font-semibold">Nome</th>
                          <th className="px-4 py-2 font-semibold">IP / Host</th>
                          <th className="px-4 py-2 font-semibold">Porta</th>
                          <th className="px-4 py-2 font-semibold">Origem</th>
                          <th className="px-4 py-2 font-semibold">Última atualização</th>
                          <th className="px-4 py-2 font-semibold">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {sortedContainers.map((container) => (
                          <tr key={container.id}>
                            <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-100">
                              <div className="flex flex-col">
                                <span>{container.name}</span>
                                {container.containerIdentifier && (
                                  <span className="text-xs text-slate-400">{container.containerIdentifier.slice(0, 12)}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{container.ipAddress}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{container.port}</td>
                            <td className="px-4 py-3">{renderContainerSource(container.source)}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                              {container.lastSeenAt ? new Date(container.lastSeenAt).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => handleDelete(container.id)}
                                disabled={deleteLoadingId === container.id}
                                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {deleteLoadingId === container.id ? 'Removendo...' : 'Remover'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
                <h4 className="text-lg font-semibold">Adicionar container manualmente</h4>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Use este formulário quando o container não puder ser identificado automaticamente.
                </p>
                <form onSubmit={handleManualSubmit} className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="manual-name" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Nome
                    </label>
                    <input
                      id="manual-name"
                      value={manualName}
                      onChange={(event) => setManualName(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="ex.: api-prod"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="manual-ip" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      IP / Hostname
                    </label>
                    <input
                      id="manual-ip"
                      value={manualIp}
                      onChange={(event) => setManualIp(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="10.0.0.5"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="manual-port" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Porta
                    </label>
                    <input
                      id="manual-port"
                      value={manualPort}
                      onChange={(event) => setManualPort(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder="8080"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="md:col-span-3 flex flex-wrap items-center gap-4">
                    <button
                      type="submit"
                      disabled={creating}
                      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900"
                    >
                      {creating ? 'Salvando...' : 'Adicionar container'}
                    </button>
                    {manualError && <span className="text-sm text-red-600">{manualError}</span>}
                    {manualSuccess && <span className="text-sm text-emerald-700">{manualSuccess}</span>}
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white/70 p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
              Selecione um ambiente para visualizar os containers relacionados.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
