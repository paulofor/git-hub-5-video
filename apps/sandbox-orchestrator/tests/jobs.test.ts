import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

import { createApp } from '../src/server.js';
import { SandboxJobProcessor } from '../src/jobProcessor.js';
import { JobProcessor, SandboxJob } from '../src/types.js';

class StubProcessor implements JobProcessor {
  async process(job: SandboxJob): Promise<void> {
    job.timeoutCount = job.timeoutCount ?? 0;
    job.httpGetCount = job.httpGetCount ?? 0;
    job.dbQueryCount = job.dbQueryCount ?? 0;
    job.startedAt = job.startedAt ?? new Date().toISOString();
    job.status = 'COMPLETED';
    job.summary = 'ok';
    job.changedFiles = ['README.md'];
    job.finishedAt = new Date().toISOString();
    job.durationMs = 0;
    job.updatedAt = job.finishedAt;
  }
}

class SleepingProcessor implements JobProcessor {
  async process(job: SandboxJob): Promise<void> {
    job.timeoutCount = job.timeoutCount ?? 0;
    job.httpGetCount = job.httpGetCount ?? 0;
    job.dbQueryCount = job.dbQueryCount ?? 0;
    job.startedAt = job.startedAt ?? new Date().toISOString();
    job.status = 'RUNNING';
    job.updatedAt = job.startedAt;
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (job.cancelRequested) {
      job.status = 'CANCELLED';
      job.finishedAt = new Date().toISOString();
      job.durationMs = 0;
      job.updatedAt = job.finishedAt;
      return;
    }
    job.status = 'COMPLETED';
    job.finishedAt = new Date().toISOString();
    job.durationMs = 200;
    job.updatedAt = job.finishedAt;
  }
}

test('reports python availability on healthcheck', async () => {
  const app = createApp({ processor: new StubProcessor() });
  const response = await request(app).get('/health').expect(200);

  assert.equal(response.body.status, 'ok');
  assert.ok(response.body.python?.python, 'python path ausente no healthcheck');
});

test('accepts a job request and processes asynchronously', async () => {
  const registry = new Map<string, SandboxJob>();
  const app = createApp({ jobRegistry: registry, processor: new StubProcessor() });
  const payload = {
    jobId: 'job-123',
    repoUrl: 'https://github.com/example/repo.git',
    branch: 'main',
    taskDescription: 'fix failing tests',
    testCommand: 'npm test',
  };

  const creation = await request(app).post('/jobs').send(payload).expect(201);
  assert.equal(creation.body.jobId, payload.jobId);
  assert.ok(['PENDING', 'RUNNING', 'COMPLETED'].includes(creation.body.status));

  // processor runs asynchronously and updates registry
  const stored = registry.get(payload.jobId);
  assert.ok(stored);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(stored!.status, 'COMPLETED');
  assert.deepEqual(stored!.changedFiles, ['README.md']);
});

test('returns existing job idempotently', async () => {
  const registry = new Map<string, SandboxJob>();
  const processor = new StubProcessor();
  const app = createApp({ jobRegistry: registry, processor });
  const payload = {
    jobId: 'job-abc',
    repoUrl: 'https://github.com/example/repo.git',
    branch: 'develop',
    taskDescription: 'refactor',
  };

  const first = await request(app).post('/jobs').send(payload).expect(201);
  const second = await request(app).post('/jobs').send(payload).expect(200);

  assert.equal(first.body.jobId, payload.jobId);
  assert.equal(second.body.jobId, payload.jobId);
});

test('não expõe o callbackSecret nas respostas', async () => {
  const registry = new Map<string, SandboxJob>();
  const app = createApp({ jobRegistry: registry, processor: new StubProcessor() });
  const payload = {
    jobId: 'job-with-callback',
    repoUrl: 'https://github.com/example/repo.git',
    branch: 'main',
    taskDescription: 'callback test',
    callbackUrl: 'http://backend:8081/api/callback',
    callbackSecret: 'super-secret',
  };

  const creation = await request(app).post('/jobs').send(payload).expect(201);
  assert.equal(creation.body.jobId, payload.jobId);
  assert.equal(creation.body.callbackUrl, payload.callbackUrl);
  assert.ok(!('callbackSecret' in creation.body) || creation.body.callbackSecret === undefined, 'callbackSecret should not be exposed');

  const stored = registry.get(payload.jobId);
  assert.equal(stored?.callbackSecret, 'super-secret');
});

test('permite cancelar um job em execução', async () => {
  const registry = new Map<string, SandboxJob>();
  const processor = new SleepingProcessor();
  const app = createApp({ jobRegistry: registry, processor });
  const payload = {
    jobId: 'job-cancel-running',
    repoUrl: 'https://github.com/example/repo.git',
    branch: 'main',
    taskDescription: 'long running task',
  };

  await request(app).post('/jobs').send(payload).expect(201);
  const cancelResponse = await request(app).post(`/jobs/${payload.jobId}/cancel`).expect(200);

  assert.equal(cancelResponse.body.cancelRequested, true);
  assert.ok(['RUNNING', 'CANCELLED', 'PENDING'].includes(cancelResponse.body.status));

  await new Promise((resolve) => setTimeout(resolve, 250));
  const stored = registry.get(payload.jobId);
  assert.ok(stored, 'job não encontrado no registry após cancelamento');
  assert.equal(stored!.status, 'CANCELLED');
  assert.equal(stored!.cancelRequested, true);
  assert.ok(stored!.finishedAt, 'finishedAt deveria ser preenchido após cancelamento');
  assert.ok(typeof stored!.durationMs === 'number');
});

test('rejects invalid payload', async () => {
  const app = createApp({ processor: new StubProcessor() });
  await request(app).post('/jobs').send({}).expect(400);
});

test('respects SANDBOX_WORKDIR when creating workspaces', async () => {
  const originalWorkdir = process.env.SANDBOX_WORKDIR;
  const customBase = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-custom-base-'));
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-custom-repo-'));

  try {
    process.env.SANDBOX_WORKDIR = customBase;

    execSync('git init', { cwd: tempRepo });
    execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
    execSync('git config user.name "CI Bot"', { cwd: tempRepo });
    await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
    execSync('git add README.md', { cwd: tempRepo });
    execSync('git commit -m "init"', { cwd: tempRepo });
    execSync('git branch -M main', { cwd: tempRepo });

    const fakeOpenAI = {
      responses: {
        create: async () => ({
          output: [
            {
              type: 'message',
              id: 'msg-workdir',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'done', annotations: [] }],
            },
          ],
        }),
      },
    } as any;

    const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
    const job: SandboxJob = {
      jobId: 'job-custom-workdir',
      repoUrl: tempRepo,
      branch: 'main',
      taskDescription: 'noop',
      status: 'PENDING',
      logs: [],
      interactions: [],
      interactionSequence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timeoutCount: 0,
    } as SandboxJob;

    await processor.process(job);

    assert.ok(job.sandboxPath?.startsWith(path.join(customBase, 'ai-hub-')));
    assert.ok(job.logs.some((entry) => entry.includes(customBase)));
  } finally {
    if (originalWorkdir === undefined) {
      delete process.env.SANDBOX_WORKDIR;
    } else {
      process.env.SANDBOX_WORKDIR = originalWorkdir;
    }
    await fs.rm(tempRepo, { recursive: true, force: true });
    await fs.rm(customBase, { recursive: true, force: true });
  }
});

test('limits oversized task descriptions before calling the model', async () => {
  const originalLimit = process.env.TASK_DESCRIPTION_MAX_CHARS;
  process.env.TASK_DESCRIPTION_MAX_CHARS = '50';

  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-long-task-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        return {
          output: [
            {
              type: 'message',
              id: 'msg-truncated',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'done', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-long-task',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'x'.repeat(200),
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const firstCall = fakeOpenAI.calls[0];
  const userMessage = firstCall.input.find((msg: any) => msg.role === 'user');
  const text = userMessage?.content?.find((item: any) => item.type === 'input_text')?.text ?? '';

  assert.ok(text.length <= 50, 'taskDescription should be truncated before sending to model');
  assert.ok(text.includes('truncated'), 'truncation hint should be present');
  assert.ok(job.logs.some((entry) => entry.includes('taskDescription com 200 caracteres')));

  if (originalLimit === undefined) {
    delete process.env.TASK_DESCRIPTION_MAX_CHARS;
  } else {
    process.env.TASK_DESCRIPTION_MAX_CHARS = originalLimit;
  }

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('returns job status', async () => {
  const registry = new Map<string, SandboxJob>();
  const processor = new StubProcessor();
  const app = createApp({ jobRegistry: registry, processor });
  registry.set('job-1', {
    jobId: 'job-1',
    repoUrl: 'https://example',
    branch: 'main',
    taskDescription: 'noop',
    status: 'COMPLETED',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
    changedFiles: [],
  });

  const response = await request(app).get('/jobs/job-1').expect(200);
  assert.equal(response.body.jobId, 'job-1');
});

test('returns orphaned workspace when registry is empty', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-orphans-'));
  const originalWorkdir = process.env.SANDBOX_WORKDIR;
  process.env.SANDBOX_WORKDIR = tempDir;

  const sandboxPath = await fs.mkdtemp(path.join(tempDir, 'ai-hub-job-orphan-'));

  try {
    const registry = new Map<string, SandboxJob>();
    const processor = new StubProcessor();
    const app = createApp({ jobRegistry: registry, processor });

    const response = await request(app).get('/jobs/job-orphan').expect(200);
    assert.equal(response.body.jobId, 'job-orphan');
    assert.equal(response.body.status, 'FAILED');
    assert.equal(response.body.sandboxPath, sandboxPath);
    assert.match(response.body.error, /workspace preservado/i);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    process.env.SANDBOX_WORKDIR = originalWorkdir;
  }
});

test('processes tool calls inside a sandbox', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-job-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'updated content' }),
              },
              { type: 'message', id: 'msg-1', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'summary ready', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-tools',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'update file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const firstCall = fakeOpenAI.calls[0];
  assert.ok(firstCall.tools, 'tools ausente na chamada inicial');
  assert.deepEqual(
    firstCall.tools.map((tool: any) => tool.name ?? tool.function?.name).filter(Boolean),
    ['run_shell', 'read_file', 'write_file', 'http_get', 'WebSearch', 'db_query']
  );

  assert.equal(job.status, 'COMPLETED', job.error);
  assert.equal(job.summary, 'summary ready');
  assert.ok(job.patch && job.patch.includes('updated content'));
  assert.ok(job.logs.some((entry) => entry.includes('write_file')));

  const secondCall = fakeOpenAI.calls[1];
  const functionCall = secondCall.input.find((msg: any) => msg.type === 'function_call');
  assert.equal(functionCall?.id, 'call-1');
  assert.equal(functionCall?.call_id, 'call-1');

  const toolMessage = secondCall.input.find((msg: any) => msg.type === 'function_call_output');
  assert.ok(toolMessage?.id.startsWith('fco_'), 'function_call_output id sem prefixo fco_');
  assert.equal(toolMessage?.call_id, 'call-1');
  const parsedTool = JSON.parse(toolMessage.output);
  assert.equal(parsedTool.path, 'README.md');
  assert.equal(parsedTool.content, 'updated content');

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('truncates tool outputs before sending them back to the model', async () => {
  const originalStringLimit = process.env.TOOL_OUTPUT_STRING_LIMIT;
  const originalSerializedLimit = process.env.TOOL_OUTPUT_SERIALIZED_LIMIT;
  process.env.TOOL_OUTPUT_STRING_LIMIT = '80';
  process.env.TOOL_OUTPUT_SERIALIZED_LIMIT = '120';

  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-tool-output-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'y'.repeat(300));
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-read-long',
                name: 'read_file',
                arguments: JSON.stringify({ path: 'README.md' }),
              },
              { type: 'message', id: 'msg-read-long', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-read-long-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'done', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-tool-truncation',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'read long file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const secondCall = fakeOpenAI.calls[1];
  const toolMessage = secondCall.input.find((msg: any) => msg.type === 'function_call_output');
  assert.ok(toolMessage, 'mensagem de tool ausente');

  const output = toolMessage?.output ?? '';
  assert.ok(output.length <= 120, 'tool output must respect serialized limit');

  const parsed = JSON.parse(output);
  assert.ok(parsed.content.includes('truncated'), 'conteúdo deve indicar truncamento');
  assert.ok(parsed.content.length <= 80, 'tool output string deve respeitar limite configurado');
  assert.ok(job.logs.some((entry) => entry.includes('output de tool truncado')));

  if (originalStringLimit === undefined) {
    delete process.env.TOOL_OUTPUT_STRING_LIMIT;
  } else {
    process.env.TOOL_OUTPUT_STRING_LIMIT = originalStringLimit;
  }

  if (originalSerializedLimit === undefined) {
    delete process.env.TOOL_OUTPUT_SERIALIZED_LIMIT;
  } else {
    process.env.TOOL_OUTPUT_SERIALIZED_LIMIT = originalSerializedLimit;
  }

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('collects patch and changed files even when the model commits changes', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-job-commit-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        const turn = fakeOpenAI.calls.length;
        if (turn === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'write-file',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'committed change' }),
              },
              { type: 'message', id: 'msg-1', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        if (turn === 2) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'add',
                name: 'run_shell',
                arguments: JSON.stringify({ command: ['git', 'add', 'README.md'], cwd: '.' }),
              },
              { type: 'message', id: 'msg-2', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        if (turn === 3) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'commit',
                name: 'run_shell',
                arguments: JSON.stringify({ command: ['git', 'commit', '-m', 'model-commit'], cwd: '.' }),
              },
              { type: 'message', id: 'msg-3', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-4',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'committed summary', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-commit',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'commit flow',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  assert.equal(job.status, 'COMPLETED', job.error);
  assert.equal(job.summary, 'committed summary');
  assert.ok(job.patch && job.patch.includes('committed change'), 'patch vazio após commit do modelo');
  assert.deepEqual(job.changedFiles, ['README.md']);

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('normalizes read_file path to repo-relative when sending tool outputs', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-read-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-read-1',
                name: 'read_file',
                arguments: JSON.stringify({ path: 'README.md' }),
              },
              { type: 'message', id: 'msg-read', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-read-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'done', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-read-path',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'read a file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const secondCall = fakeOpenAI.calls[1];
  const toolMessage = secondCall.input.find((msg: any) => msg.type === 'function_call_output');
  assert.ok(toolMessage, 'mensagem da ferramenta ausente');
  const parsedOutput = JSON.parse(toolMessage.output);
  assert.equal(parsedOutput.path, 'README.md');
  assert.equal(parsedOutput.content, 'initial');

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('returns tool errors to the model instead of failing the job', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-error-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-error-1',
                name: 'read_file',
                arguments: JSON.stringify({ path: 'package.json' }),
              },
              { type: 'message', id: 'msg-err', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        const toolMessage = payload.input.find((msg: any) => msg.type === 'function_call_output');
        const parsed = toolMessage ? JSON.parse(toolMessage.output) : {};
        return {
          output: [
            {
              type: 'message',
              id: 'msg-err-2',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: parsed.error ? 'handled missing file' : 'no error',
                  annotations: [],
                },
              ],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-error',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'read a missing file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const secondCall = fakeOpenAI.calls[1];
  const toolMessage = secondCall.input.find((msg: any) => msg.type === 'function_call_output');
  assert.ok(toolMessage, 'mensagem de ferramenta ausente');
  const parsedOutput = JSON.parse(toolMessage.output);
  assert.ok(parsedOutput.error, 'tool error deve ser retornado ao modelo');
  assert.equal(job.status, 'COMPLETED');
  assert.equal(job.summary, 'handled missing file');

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('http_get fetches public content while sanitizing headers and truncating body', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-http-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'http-call',
                name: 'http_get',
                arguments: JSON.stringify({ url: 'https://example.com/docs', headers: { Authorization: 'x', Accept: 'text/plain' } }),
              },
              { type: 'message', id: 'msg-http-1', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-http-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'http ok', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    fetchCalls.push({ input, init });
    return {
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => 'conteúdo público'.repeat(5),
    } as any;
  };

  const originalLimit = process.env.HTTP_TOOL_MAX_RESPONSE_CHARS;
  process.env.HTTP_TOOL_MAX_RESPONSE_CHARS = '20';

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-http',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'fetch docs',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);
  assert.equal(job.httpGetCount, 1, 'http_get deve ser contabilizado');
  assert.equal(job.httpGetSuccessCount, 1, 'http_get bem-sucedido deve ser contado');
  assert.ok(job.httpRequests, 'httpRequests deve ser preenchido');
  assert.equal(job.httpRequests?.length, 1, 'deve registrar a chamada http_get');
  const httpLog = job.httpRequests?.[0];
  assert.ok(httpLog, 'log http_get ausente');
  assert.equal(httpLog?.toolName, 'http_get');
  assert.equal(httpLog?.status, 200);
  assert.equal(httpLog?.success, true);
  assert.ok(httpLog?.requestedAt, 'requestedAt deve ser informado');
  assert.ok(httpLog?.url.includes('example.com/docs'));

  const callOutput = fakeOpenAI.calls[1].input.find((msg: any) => msg.type === 'function_call_output');
  const parsed = JSON.parse(callOutput.output);
  assert.equal(parsed.status, 200);
  assert.equal(parsed.headers['content-type'], 'text/plain');
  assert.ok(parsed.truncated, 'body deve estar truncado');
  assert.ok(parsed.body.includes('truncated'), 'resposta deve indicar truncamento do corpo');
  assert.equal(job.summary, 'http ok');
  assert.equal(fetchCalls[0].init?.method, 'GET');
  assert.ok(!('authorization' in fetchCalls[0].init.headers));

  if (originalLimit === undefined) {
    delete process.env.HTTP_TOOL_MAX_RESPONSE_CHARS;
  } else {
    process.env.HTTP_TOOL_MAX_RESPONSE_CHARS = originalLimit;
  }

  await fs.rm(tempRepo, { recursive: true, force: true });
});


test('WebSearch atua como alias de http_get contabilizando sucessos', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-websearch-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'search-1',
                name: 'WebSearch',
                arguments: JSON.stringify({ url: 'https://example.com/search?q=test' }),
              },
              { type: 'message', id: 'msg-web-1', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-web-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'search ok', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    fetchCalls.push({ input, init });
    return {
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html>ok</html>',
      ok: true,
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-websearch',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'search web',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);
  assert.equal(job.httpGetCount, 1, 'WebSearch deve incrementar httpGetCount');
  assert.equal(job.httpGetSuccessCount, 1, 'WebSearch bem-sucedido deve incrementar sucesso');
  assert.equal(job.httpRequests?.length, 1, 'WebSearch deve registrar log');
  const httpLog = job.httpRequests?.[0];
  assert.equal(httpLog?.toolName, 'WebSearch');
  assert.equal(httpLog?.success, true);
  assert.equal(httpLog?.status, 200);
  assert.ok((httpLog?.url ?? '').includes('example.com/search'));

  const callOutput = fakeOpenAI.calls[1].input.find((msg: any) => msg.type === 'function_call_output');
  const parsed = JSON.parse(callOutput.output);
  assert.equal(parsed.status, 200);
  assert.equal(job.summary, 'search ok');
  assert.equal(fetchCalls[0].init?.method, 'GET');
  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('http_get blocks private addresses and returns an error to the model', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-http-block-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'http-block',
                name: 'http_get',
                arguments: JSON.stringify({ url: 'http://127.0.0.1:8083' }),
              },
              { type: 'message', id: 'msg-http-block-1', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        const toolMessage = payload.input.find((msg: any) => msg.type === 'function_call_output');
        const parsed = toolMessage ? JSON.parse(toolMessage.output) : {};
        return {
          output: [
            {
              type: 'message',
              id: 'msg-http-block-2',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: parsed.error ? 'http error propagated' : 'no error',
                  annotations: [],
                },
              ],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-http-block',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'fetch forbidden',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);
  assert.equal(job.httpGetCount, 1, 'http_get inválido também deve contar');
  assert.equal(job.httpGetSuccessCount ?? 0, 0, 'chamadas bloqueadas não devem contar como sucesso');
  assert.equal(job.httpRequests?.length ?? 0, 0, 'chamadas bloqueadas não devem ser registradas');

  const toolMessage = fakeOpenAI.calls[1].input.find((msg: any) => msg.type === 'function_call_output');
  const parsed = JSON.parse(toolMessage.output);
  assert.ok(parsed.error?.includes('bloqueado') || parsed.error?.includes('permitidas'));
  assert.equal(job.summary, 'http error propagated');
  assert.equal(job.status, 'COMPLETED');

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('propagates tool errors for a single call id', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-dir-error-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-dir-error',
                name: 'read_file',
                arguments: JSON.stringify({ path: '.' }),
              },
              { type: 'message', id: 'msg-dir', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        const outputs = payload.input.filter((msg: any) => msg.type === 'function_call_output');
        return {
          output: [
            {
              type: 'message',
              id: 'msg-dir-2',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: outputs.length > 0 ? 'errors returned' : 'missing outputs',
                  annotations: [],
                },
              ],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-dir-error',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'try to read directory',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  await processor.process(job);

  const secondCall = fakeOpenAI.calls[1];
  const outputs = secondCall.input.filter((msg: any) => msg.type === 'function_call_output');

  assert.equal(outputs.length, 1, 'apenas um call_id deve receber output');
  const parsed = JSON.parse(outputs[0].output);
  assert.equal(outputs[0].call_id, 'call-dir-error');
  assert.ok(parsed.error, 'erro da ferramenta deve ser propagado');
  assert.equal(job.status, 'COMPLETED');
  assert.equal(job.summary, 'errors returned');

  await fs.rm(tempRepo, { recursive: true, force: true });
});

test('pushes changes and opens a pull request when credentials are present', async () => {
  const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-remote-'));
  execSync('git init --bare', { cwd: bareRepo });

  const seedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-seed-'));
  execSync('git init', { cwd: seedRepo });
  execSync('git config user.email "ci@example.com"', { cwd: seedRepo });
  execSync('git config user.name "CI Bot"', { cwd: seedRepo });
  await fs.writeFile(path.join(seedRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: seedRepo });
  execSync('git commit -m "init"', { cwd: seedRepo });
  execSync('git branch -M main', { cwd: seedRepo });
  execSync(`git remote add origin ${bareRepo}`, { cwd: seedRepo });
  execSync('git push origin main', { cwd: seedRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-pr-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'updated for pr' }),
              },
              { type: 'message', id: 'msg-pr', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-pr-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'pr ready', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/example/repo/pull/1' }),
      text: async () => 'ok',
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-pr',
    repoSlug: 'example/repo',
    repoUrl: bareRepo,
    branch: 'main',
    taskDescription: 'update readme',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  const originalToken = process.env.GITHUB_PR_TOKEN;
  process.env.GITHUB_PR_TOKEN = 'fake-token';

  await processor.process(job);

  const heads = execSync(`git ls-remote ${bareRepo} refs/heads/ai-hub/cifix-${job.jobId}`);
  assert.ok(heads.toString().includes(`ai-hub/cifix-${job.jobId}`));
  assert.equal(job.pullRequestUrl, 'https://github.com/example/repo/pull/1');
  assert.ok(fetchCalls.length > 0, 'fetch não foi chamado para criar PR');
  assert.ok(
    fetchCalls[0].url.endsWith('/repos/example/repo/pulls'),
    'PR deve ser criado no endpoint de pulls do repositório',
  );

  process.env.GITHUB_PR_TOKEN = originalToken;
  await fs.rm(bareRepo, { recursive: true, force: true });
  await fs.rm(seedRepo, { recursive: true, force: true });
});


test('creates a pull request when only new files are added', async () => {
  const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-new-files-remote-'));
  execSync('git init --bare', { cwd: bareRepo });

  const seedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-new-files-seed-'));
  execSync('git init', { cwd: seedRepo });
  execSync('git config user.email "ci@example.com"', { cwd: seedRepo });
  execSync('git config user.name "CI Bot"', { cwd: seedRepo });
  await fs.writeFile(path.join(seedRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: seedRepo });
  execSync('git commit -m "init"', { cwd: seedRepo });
  execSync('git branch -M main', { cwd: seedRepo });
  execSync(`git remote add origin ${bareRepo}`, { cwd: seedRepo });
  execSync('git push origin main', { cwd: seedRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-pr-new-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'docs/new-feature.md', content: 'new docs content' }),
              },
              { type: 'message', id: 'msg-pr-new', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-pr-new-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'docs added', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/example/repo/pull/4' }),
      text: async () => 'ok',
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-pr-new-files',
    repoSlug: 'example/repo',
    repoUrl: bareRepo,
    branch: 'main',
    taskDescription: 'add docs',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
  } as SandboxJob;

  const originalToken = process.env.GITHUB_PR_TOKEN;
  process.env.GITHUB_PR_TOKEN = 'fake-token';

  await processor.process(job);

  const heads = execSync(`git ls-remote ${bareRepo} refs/heads/ai-hub/cifix-${job.jobId}`);
  assert.ok(heads.toString().includes(`ai-hub/cifix-${job.jobId}`));
  assert.equal(job.pullRequestUrl, 'https://github.com/example/repo/pull/4');
  assert.ok(fetchCalls.length > 0, 'fetch não foi chamado para criar PR');
  assert.ok(job.changedFiles?.includes('docs/new-feature.md'));

  if (originalToken === undefined) {
    delete process.env.GITHUB_PR_TOKEN;
  } else {
    process.env.GITHUB_PR_TOKEN = originalToken;
  }

  await fs.rm(bareRepo, { recursive: true, force: true });
  await fs.rm(seedRepo, { recursive: true, force: true });
});

test('limits pull request title and keeps full summary in body', async () => {
  const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-long-remote-'));
  execSync('git init --bare', { cwd: bareRepo });

  const seedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-long-seed-'));
  execSync('git init', { cwd: seedRepo });
  execSync('git config user.email "ci@example.com"', { cwd: seedRepo });
  execSync('git config user.name "CI Bot"', { cwd: seedRepo });
  await fs.writeFile(path.join(seedRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: seedRepo });
  execSync('git commit -m "init"', { cwd: seedRepo });
  execSync('git branch -M main', { cwd: seedRepo });
  execSync(`git remote add origin ${bareRepo}`, { cwd: seedRepo });
  execSync('git push origin main', { cwd: seedRepo });

  const longSummary = 'a'.repeat(300);
  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-pr-long-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'updated for pr' }),
              },
              { type: 'message', id: 'msg-pr-long', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-pr-long-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: longSummary, annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/example/repo/pull/3' }),
      text: async () => 'ok',
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-pr-long',
    repoSlug: 'example/repo',
    repoUrl: bareRepo,
    branch: 'main',
    taskDescription: 'update readme',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  const originalToken = process.env.GITHUB_PR_TOKEN;
  process.env.GITHUB_PR_TOKEN = 'fake-token';

  await processor.process(job);

  const payload = JSON.parse(fetchCalls[0].init.body);
  assert.ok(payload.title.length <= 256, 'título do PR deve respeitar o limite do GitHub');
  assert.equal(payload.title, `AI Hub: ${longSummary.slice(0, 247)}…`);
  assert.ok(
    payload.body.includes(longSummary),
    'corpo do PR deve conter o resumo completo, sem truncar',
  );
  assert.ok(payload.body.includes('Descrição da tarefa'), 'corpo do PR deve incluir a tarefa');

  process.env.GITHUB_PR_TOKEN = originalToken;
  await fs.rm(bareRepo, { recursive: true, force: true });
  await fs.rm(seedRepo, { recursive: true, force: true });
});

test('reuses repository credentials from repoUrl when creating a pull request', async () => {
  const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-url-'));
  execSync('git init --bare', { cwd: bareRepo });

  const seedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-url-seed-'));
  execSync('git init', { cwd: seedRepo });
  execSync('git config user.email "ci@example.com"', { cwd: seedRepo });
  execSync('git config user.name "CI Bot"', { cwd: seedRepo });
  await fs.writeFile(path.join(seedRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: seedRepo });
  execSync('git commit -m "init"', { cwd: seedRepo });
  execSync('git branch -M main', { cwd: seedRepo });
  execSync(`git remote add origin ${bareRepo}`, { cwd: seedRepo });
  execSync('git push origin main', { cwd: seedRepo });

  const repoUrl = bareRepo;

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-pr-url-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'updated via url token' }),
              },
              { type: 'message', id: 'msg-pr-url', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-pr-url-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'pr ready from url token', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({ url, init });
    return {
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/example/repo/pull/2' }),
      text: async () => 'ok',
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const originalClone = (processor as any).cloneRepository?.bind(processor);
  (processor as any).cloneRepository = async (...args: any[]) => {
    if (originalClone) {
      await originalClone(...args);
    }
    delete process.env.GITHUB_CLONE_TOKEN;
    delete process.env.GITHUB_TOKEN;
  };
  const job: SandboxJob = {
    jobId: 'job-pr-url',
    repoSlug: 'example/repo',
    repoUrl,
    branch: 'main',
    taskDescription: 'update readme',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  timeoutCount: 0,
  } as SandboxJob;

  const originalPrToken = process.env.GITHUB_PR_TOKEN;
  const originalCloneToken = process.env.GITHUB_CLONE_TOKEN;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_PR_TOKEN;
  process.env.GITHUB_CLONE_TOKEN = 'embedded-token';
  delete process.env.GITHUB_TOKEN;

  await processor.process(job);

  const pushedBranch = execSync(`git ls-remote ${bareRepo} refs/heads/ai-hub/cifix-${job.jobId}`);
  assert.ok(pushedBranch.toString().includes(`ai-hub/cifix-${job.jobId}`));
  assert.equal(job.pullRequestUrl, 'https://github.com/example/repo/pull/2');
  assert.ok(fetchCalls.length > 0, 'fetch não foi chamado para criar PR');
  assert.ok(
    fetchCalls[0].init?.headers?.Authorization.includes('embedded-token'),
    'token do repoUrl deve ser reutilizado ao criar PR',
  );

  if (originalPrToken === undefined) {
    delete process.env.GITHUB_PR_TOKEN;
  } else {
    process.env.GITHUB_PR_TOKEN = originalPrToken;
  }
  if (originalCloneToken === undefined) {
    delete process.env.GITHUB_CLONE_TOKEN;
  } else {
    process.env.GITHUB_CLONE_TOKEN = originalCloneToken;
  }
  if (originalGithubToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGithubToken;
  }

  await fs.rm(bareRepo, { recursive: true, force: true });
  await fs.rm(seedRepo, { recursive: true, force: true });
});




test('retries pull request creation after transient errors', async () => {
  const bareRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-retry-remote-'));
  execSync('git init --bare', { cwd: bareRepo });

  const seedRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-pr-retry-seed-'));
  execSync('git init', { cwd: seedRepo });
  execSync('git config user.email "ci@example.com"', { cwd: seedRepo });
  execSync('git config user.name "CI Bot"', { cwd: seedRepo });
  await fs.writeFile(path.join(seedRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: seedRepo });
  execSync('git commit -m "init"', { cwd: seedRepo });
  execSync('git branch -M main', { cwd: seedRepo });
  execSync(`git remote add origin ${bareRepo}`, { cwd: seedRepo });
  execSync('git push origin main', { cwd: seedRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async (payload: any) => {
        fakeOpenAI.calls.push(payload);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'call-pr-retry-1',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'retry content' }),
              },
              { type: 'message', id: 'msg-pr-retry', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-pr-retry-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'retry summary', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const fetchCalls: any[] = [];
  const fakeFetch = async (input: string | URL, init?: any) => {
    const url = typeof input === 'string' ? input : input.toString();
    const attempt = fetchCalls.length + 1;
    fetchCalls.push({ attempt, url, init });
    if (attempt === 1) {
      const error: any = new Error('fetch failed');
      error.code = 'ECONNRESET';
      throw error;
    }
    if (attempt === 2) {
      return {
        ok: false,
        status: 502,
        text: async () => 'bad gateway',
      } as any;
    }
    return {
      ok: true,
      status: 201,
      json: async () => ({ html_url: 'https://github.com/example/repo/pull/7' }),
      text: async () => 'ok',
    } as any;
  };

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI, fakeFetch);
  const job: SandboxJob = {
    jobId: 'job-pr-retry',
    repoSlug: 'example/repo',
    repoUrl: bareRepo,
    branch: 'main',
    taskDescription: 'retry pr creation',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
  } as SandboxJob;

  const originalToken = process.env.GITHUB_PR_TOKEN;
  const originalAttempts = process.env.PR_CREATE_RETRY_ATTEMPTS;
  const originalDelay = process.env.PR_CREATE_RETRY_DELAY_MS;
  process.env.GITHUB_PR_TOKEN = 'fake-token';
  process.env.PR_CREATE_RETRY_ATTEMPTS = '3';
  process.env.PR_CREATE_RETRY_DELAY_MS = '1';

  try {
    await processor.process(job);
  } finally {
    if (originalToken === undefined) {
      delete process.env.GITHUB_PR_TOKEN;
    } else {
      process.env.GITHUB_PR_TOKEN = originalToken;
    }
    if (originalAttempts === undefined) {
      delete process.env.PR_CREATE_RETRY_ATTEMPTS;
    } else {
      process.env.PR_CREATE_RETRY_ATTEMPTS = originalAttempts;
    }
    if (originalDelay === undefined) {
      delete process.env.PR_CREATE_RETRY_DELAY_MS;
    } else {
      process.env.PR_CREATE_RETRY_DELAY_MS = originalDelay;
    }
  }

  assert.equal(job.pullRequestUrl, 'https://github.com/example/repo/pull/7');
  assert.equal(fetchCalls.length, 3);
  assert.ok(
    job.logs.some((entry) => entry.includes('tentativa 1/3 falhou ao chamar API do GitHub')),
    'deve registrar o retry após erro de rede',
  );
  assert.ok(
    job.logs.some((entry) => entry.includes('tentativa 2/3 ao criar PR retornou status 502')),
    'deve registrar o retry após status HTTP 5xx',
  );

  await fs.rm(bareRepo, { recursive: true, force: true });
  await fs.rm(seedRepo, { recursive: true, force: true });
});
test('db_query executa SELECT e contabiliza chamadas', async () => {
  const processor = new SandboxJobProcessor();
  const job: SandboxJob = {
    jobId: 'job-db-query',
    repoUrl: 'https://github.com/example/repo.git',
    branch: 'main',
    taskDescription: 'inspect database',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
  } as SandboxJob;

  job.database = {
    host: 'localhost',
    port: 3306,
    user: 'user',
    password: 'pass',
    database: 'db',
  };

  const fakeRows = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];

  (processor as any).dbPools.set(job.jobId, {
    query: async () => [fakeRows],
  });

  const first = await (processor as any).handleDbQuery(
    { query: 'SELECT id, name FROM users', limit: 1 },
    job,
  );

  assert.equal(job.dbQueryCount, 1, 'db_query deve ser contabilizado');
  assert.equal(first.rowCount, 1);
  assert.equal(first.truncated, true);
  assert.deepEqual(first.columns, ['id', 'name']);
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].name, 'Alice');

  const second = await (processor as any).handleDbQuery(
    { query: 'WITH users_cte AS (SELECT * FROM users) SELECT * FROM users_cte' },
    job,
  );

  assert.equal(job.dbQueryCount, 2, 'db_query deve acumular chamadas');
  assert.equal(second.truncated, false);
  assert.equal(second.rowCount, 2);
  assert.deepEqual(second.columns, ['id', 'name']);
});


test('executa testCommand configurado antes de concluir o job', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-testcmd-success-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async () => {
        fakeOpenAI.calls.push(null);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'write-testcmd',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'test command OK' }),
              },
              { type: 'message', id: 'msg-testcmd', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-testcmd-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'done', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-testcmd-success',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'touch file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
    testCommand: 'ls',
  } as SandboxJob;

  try {
    await processor.process(job);
    assert.equal(job.status, 'COMPLETED', job.error);
    assert.ok(job.patch?.includes('test command OK'));
    assert.ok(job.logs.some((entry) => entry.includes('testCommand finalizado com sucesso')));
  } finally {
    await fs.rm(tempRepo, { recursive: true, force: true });
  }
});


test('marca o job como falho quando o testCommand retorna erro', async () => {
  const tempRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-testcmd-fail-'));
  execSync('git init', { cwd: tempRepo });
  execSync('git config user.email "ci@example.com"', { cwd: tempRepo });
  execSync('git config user.name "CI Bot"', { cwd: tempRepo });
  await fs.writeFile(path.join(tempRepo, 'README.md'), 'initial');
  execSync('git add README.md', { cwd: tempRepo });
  execSync('git commit -m "init"', { cwd: tempRepo });
  execSync('git branch -M main', { cwd: tempRepo });

  const fakeOpenAI = {
    calls: [] as any[],
    responses: {
      create: async () => {
        fakeOpenAI.calls.push(null);
        if (fakeOpenAI.calls.length === 1) {
          return {
            output: [
              {
                type: 'function_call',
                call_id: 'write-testcmd-fail',
                name: 'write_file',
                arguments: JSON.stringify({ path: 'README.md', content: 'broken change' }),
              },
              { type: 'message', id: 'msg-testcmd-fail', role: 'assistant', status: 'completed', content: [] },
            ],
          };
        }
        return {
          output: [
            {
              type: 'message',
              id: 'msg-testcmd-fail-2',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: 'summary', annotations: [] }],
            },
          ],
        };
      },
    },
  } as any;

  const processor = new SandboxJobProcessor(undefined, 'gpt-5-codex', fakeOpenAI);
  const job: SandboxJob = {
    jobId: 'job-testcmd-failure',
    repoUrl: tempRepo,
    branch: 'main',
    taskDescription: 'touch file',
    status: 'PENDING',
    logs: [],
    interactions: [],
    interactionSequence: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    timeoutCount: 0,
    testCommand: 'exit 7',
  } as SandboxJob;

  try {
    await processor.process(job);
    assert.equal(job.status, 'FAILED');
    assert.match(job.error ?? '', /testCommand/);
    assert.ok(job.patch?.includes('broken change'));
    assert.ok(job.logs.some((entry) => entry.includes('executando testCommand configurado')));
  } finally {
    await fs.rm(tempRepo, { recursive: true, force: true });
  }
});
