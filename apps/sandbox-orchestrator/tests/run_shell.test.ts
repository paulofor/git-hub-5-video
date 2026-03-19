import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SandboxJobProcessor } from '../src/jobProcessor.js';
import { SandboxJob } from '../src/types.js';

const createJob = (): SandboxJob => ({
  jobId: `job-${Date.now()}`,
  repoUrl: 'https://example.com/repo.git',
  branch: 'main',
  taskDescription: 'validate run_shell behavior',
  status: 'PENDING',
  logs: [],
  interactions: [],
  interactionSequence: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  httpGetCount: 0,
  dbQueryCount: 0,
});

test('substitui grep -R por rg com log explicativo', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-grep-rg-'));
  await fs.writeFile(path.join(repoPath, 'sample.txt'), 'buscar valor aqui');

  const processor = new SandboxJobProcessor();
  const job = createJob();

  const result = await (processor as any).handleRunShell(
    { command: ['grep', '-R', 'buscar', '.'], cwd: '.' },
    repoPath,
    job,
  );

  assert.equal(result.exitCode, 0, 'rg deveria executar com sucesso');
  assert.ok(result.stdout.includes('buscar valor aqui'), 'stdout deve conter o resultado do rg');
  const substitutionLog = job.logs.find((entry) => entry.includes('grep -R detectado; substituindo por rg'));
  assert.ok(substitutionLog, 'log de substituição para rg não encontrado');

  await fs.rm(repoPath, { recursive: true, force: true });
});

test('recusa grep -R sem argumentos adicionais com orientação de uso do rg', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-grep-reject-'));
  const processor = new SandboxJobProcessor();
  const job = createJob();

  await assert.rejects(
    () => (processor as any).handleRunShell({ command: ['grep', '-R'], cwd: '.' }, repoPath, job),
    /Use rg <padrao> <caminho> para buscas recursivas no sandbox/,
  );

  const refusalLog = job.logs.find((entry) => entry.includes('grep -R detectado. Use rg'));
  assert.ok(refusalLog, 'log de recusa do grep -R não encontrado');

  await fs.rm(repoPath, { recursive: true, force: true });
});

test('normaliza cwd com caracteres extras e prossegue usando raiz do repo', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-cwd-trim-'));
  await fs.writeFile(path.join(repoPath, 'file.txt'), 'conteudo');

  const processor = new SandboxJobProcessor();
  const job = createJob();

  const result = await (processor as any).handleRunShell(
    { command: ['ls'], cwd: '.}' },
    repoPath,
    job,
  );

  assert.equal(result.exitCode, 0, 'ls deveria executar com sucesso após normalizar cwd');
  const normalizationLog = job.logs.find((entry) =>
    entry.includes('normalizando caminho solicitado de ".}" para "."'),
  );
  assert.ok(normalizationLog, 'log de normalização do cwd não encontrado');

  await fs.rm(repoPath, { recursive: true, force: true });
});

test('usa timeout estendido para comandos mvn', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-mvn-timeout-'));
  const mvnPath = path.join(repoPath, 'mvn');
  await fs.writeFile(mvnPath, '#!/bin/sh\necho mvn-ok');
  await fs.chmod(mvnPath, 0o755);

  const originalTimeout = process.env.RUN_SHELL_TIMEOUT_MS;
  process.env.RUN_SHELL_TIMEOUT_MS = '1000';

  const processor = new SandboxJobProcessor();
  const job = createJob();

  try {
    const result = await (processor as any).handleRunShell({ command: ['./mvn'], cwd: '.' }, repoPath, job);

    assert.equal(result.exitCode, 0, 'mvn stub deveria executar com sucesso');
    const runLog = job.logs.find((entry) => entry.includes('run_shell: ./mvn'));
    assert.ok(runLog?.includes('timeoutMs=900000'), 'timeout deveria ser ajustado para 15 minutos');
    const increaseLog = job.logs.find((entry) =>
      entry.includes('mvn detectado; aumentando timeout para 15 minutos'),
    );
    assert.ok(increaseLog, 'log de aumento de timeout para mvn não encontrado');
  } finally {
    if (originalTimeout === undefined) {
      delete process.env.RUN_SHELL_TIMEOUT_MS;
    } else {
      process.env.RUN_SHELL_TIMEOUT_MS = originalTimeout;
    }
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});

test('aplica CI=1 automaticamente para evitar modo watch em comandos de teste', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-ci-env-'));
  const npmPath = path.join(repoPath, 'npm');
  await fs.writeFile(npmPath, '#!/bin/sh\necho CI=$CI NODE_ENV=$NODE_ENV');
  await fs.chmod(npmPath, 0o755);

  const processor = new SandboxJobProcessor();
  const job = createJob();

  const result = await (processor as any).handleRunShell({ command: ['./npm', 'test'], cwd: '.' }, repoPath, job);

  assert.equal(result.exitCode, 0, 'stub npm deveria executar com sucesso');
  assert.ok(result.stdout.includes('CI=1'), 'stdout deve indicar CI=1 aplicado');
  assert.ok(result.stdout.includes('NODE_ENV=test'), 'stdout deve indicar NODE_ENV=test aplicado');
  const ciLog = job.logs.find((entry) => entry.includes('CI=1 aplicado para evitar modo watch'));
  assert.ok(ciLog, 'log de aplicação do CI=1 não encontrado');
  const nodeEnvLog = job.logs.find((entry) =>
    entry.includes('NODE_ENV=test aplicado para evitar React em modo produção durante testes'),
  );
  assert.ok(nodeEnvLog, 'log de aplicação do NODE_ENV=test não encontrado');

  await fs.rm(repoPath, { recursive: true, force: true });
});

test('identifica scripts de teste com npm run test:* para aplicar CI=1 e NODE_ENV=test', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-npm-run-test-script-'));
  const npmPath = path.join(repoPath, 'npm');
  await fs.writeFile(npmPath, '#!/bin/sh\necho CI=$CI NODE_ENV=$NODE_ENV');
  await fs.chmod(npmPath, 0o755);

  const processor = new SandboxJobProcessor();
  const job = createJob();

  const result = await (processor as any).handleRunShell(
    { command: ['./npm', 'run', 'test:unit'], cwd: '.' },
    repoPath,
    job,
  );

  assert.equal(result.exitCode, 0, 'stub npm run test:unit deveria executar com sucesso');
  assert.ok(result.stdout.includes('CI=1'), 'stdout deve indicar CI=1 aplicado para npm run test:*');
  assert.ok(result.stdout.includes('NODE_ENV=test'), 'stdout deve indicar NODE_ENV=test aplicado para npm run test:*');

  await fs.rm(repoPath, { recursive: true, force: true });
});


test('incrementa timeoutCount quando run_shell atinge timeout', async () => {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-timeout-count-'));
  const originalTimeout = process.env.RUN_SHELL_TIMEOUT_MS;
  process.env.RUN_SHELL_TIMEOUT_MS = '50';

  try {
    const processor = new SandboxJobProcessor();
    const job = createJob();

    const result = await (processor as any).handleRunShell(
      { command: ['node', '-e', 'setTimeout(() => {}, 1000);'], cwd: '.' },
      repoPath,
      job,
    );

    assert.equal(result.timedOut, true, 'o comando deveria ser encerrado por timeout');
    assert.equal(job.timeoutCount, 1, 'timeoutCount deve ser incrementado após timeout');
  } finally {
    if (originalTimeout === undefined) {
      delete process.env.RUN_SHELL_TIMEOUT_MS;
    } else {
      process.env.RUN_SHELL_TIMEOUT_MS = originalTimeout;
    }
    await fs.rm(repoPath, { recursive: true, force: true });
  }
});
