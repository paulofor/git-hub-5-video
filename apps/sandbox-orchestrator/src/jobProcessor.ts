import { exec as execCallback, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import mysql, { Pool } from 'mysql2/promise';
import OpenAI from 'openai';
import {
  ResponseFunctionToolCallItem,
  ResponseFunctionToolCallOutputItem,
  ResponseItem,
  ResponseOutputMessage,
  ResponseOutputText,
} from 'openai/resources/responses/responses.js';

import { buildAuthRepoUrl, extractTokenFromRepoUrl, redactUrlCredentials } from './git.js';
import { JobProcessor, SandboxJob, SandboxProfile, SandboxInteraction, SandboxHttpRequestLog, SandboxDatabaseConfig } from './types.js';

const exec = promisify(execCallback);

const ECO_TWO_LOOP_GUARDED_TOOLS = new Set(['run_shell', 'http_get', 'WebSearch', 'db_query']);

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
}

interface EcoTwoLoopAttempt {
  signature: string;
  outputHash: string;
  toolName: string;
  timestamp: number;
}

interface EcoTwoLoopState {
  attempts: EcoTwoLoopAttempt[];
  blockedSignature?: string;
  blockedCount: number;
}

interface EcoTwoLoopBlockResult {
  payload: Record<string, unknown>;
  logMessage: string;
}

class JobCancelledError extends Error {
  constructor(message = 'Job cancelado pelo usuário') {
    super(message);
    this.name = 'JobCancelledError';
  }
}

export class SandboxJobProcessor implements JobProcessor {
  private readonly openai?: OpenAI;
  private readonly model: string;
  private readonly fetchImpl?: (input: string | URL, init?: any) => Promise<any>;
  private readonly githubApiBase: string;
  private readonly maxTaskDescriptionChars: number;
  private readonly toolOutputStringLimit: number;
  private readonly toolOutputSerializedLimit: number;
  private readonly httpToolTimeoutMs: number;
  private readonly httpToolMaxResponseChars: number;
  private readonly economyModel?: string;
  private readonly economyMaxTaskDescriptionChars: number;
  private readonly economyToolOutputStringLimit: number;
  private readonly economyToolOutputSerializedLimit: number;
  private readonly economyHttpToolMaxResponseChars: number;
  private readonly smartEconomyMaxTaskDescriptionChars: number;
  private readonly smartEconomyToolOutputStringLimit: number;
  private readonly smartEconomyToolOutputSerializedLimit: number;
  private readonly smartEconomyHttpToolMaxResponseChars: number;
  private readonly ecoOneMaxTaskDescriptionChars: number;
  private readonly ecoOneToolOutputStringLimit: number;
  private readonly ecoOneToolOutputSerializedLimit: number;
  private readonly ecoOneHttpToolMaxResponseChars: number;
  private readonly chatgptCodexMaxTaskDescriptionChars: number;
  private readonly chatgptCodexToolOutputStringLimit: number;
  private readonly chatgptCodexToolOutputSerializedLimit: number;
  private readonly chatgptCodexHttpToolMaxResponseChars: number;
  private readonly ecoTwoAutoCompactTokenLimit: number;
  private readonly ecoTwoHistoryTargetTokens: number;
  private readonly ecoTwoUserMessageTokenLimit: number;
  private readonly ecoTwoToolOutputStringLimit: number;
  private readonly ecoTwoToolOutputSerializedLimit: number;
  private readonly ecoTwoHttpToolMaxResponseChars: number;
  private readonly ecoTwoCharsPerTokenEstimate: number;
  private readonly ecoTwoMaxIdenticalToolAttempts: number;
  private readonly ecoTwoLoopHistorySize: number;
  private readonly ecoTwoLoopStates: WeakMap<SandboxJob, EcoTwoLoopState> = new WeakMap();
  private readonly ecoThreeAutoCompactTokenLimit: number;
  private readonly ecoThreeHistoryTargetTokens: number;
  private readonly ecoThreeUserMessageTokenLimit: number;
  private readonly ecoThreeToolOutputStringLimit: number;
  private readonly ecoThreeToolOutputSerializedLimit: number;
  private readonly ecoThreeHttpToolMaxResponseChars: number;
  private readonly ecoThreeMaxTurns: number;
  private readonly ecoThreeMaxTotalTokens: number;
  private readonly dbQueryTimeoutMs: number;
  private readonly dbMaxRows: number;
  private readonly dbConfigFromEnv?: SandboxDatabaseConfig;
  private readonly dbPools: Map<string, Pool> = new Map();
  private readonly prCreateMaxAttempts: number;
  private readonly prCreateRetryDelayMs: number;

  constructor(
    apiKey?: string,
    model = 'gpt-5-codex',
    openaiClient?: OpenAI,
    fetchImpl: (input: string | URL, init?: any) => Promise<any> = globalThis.fetch,
  ) {
    this.model = model;
    if (openaiClient) {
      this.openai = openaiClient;
    } else if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    }
    this.fetchImpl = fetchImpl;
    this.githubApiBase = process.env.GITHUB_API_URL ?? 'https://api.github.com';
    this.maxTaskDescriptionChars = this.parsePositiveInteger(process.env.TASK_DESCRIPTION_MAX_CHARS, 12_000);
    this.toolOutputStringLimit = this.parsePositiveInteger(process.env.TOOL_OUTPUT_STRING_LIMIT, 12_000);
    this.toolOutputSerializedLimit = this.parsePositiveInteger(process.env.TOOL_OUTPUT_SERIALIZED_LIMIT, 60_000);
    this.httpToolTimeoutMs = this.parsePositiveInteger(process.env.HTTP_TOOL_TIMEOUT_MS, 15_000);
    this.httpToolMaxResponseChars = this.parsePositiveInteger(process.env.HTTP_TOOL_MAX_RESPONSE_CHARS, 20_000);
    const configuredEconomyModel = process.env.CIFIX_MODEL_ECONOMY ?? process.env.CIFIX_ECONOMY_MODEL;
    if (configuredEconomyModel && configuredEconomyModel.trim()) {
      this.economyModel = configuredEconomyModel.trim();
    } else if (this.model === 'gpt-5-codex') {
      this.economyModel = 'gpt-4.1-mini';
    } else {
      this.economyModel = this.model;
    }

    const economyTaskLimitRaw = this.parsePositiveInteger(
      process.env.ECONOMY_TASK_DESCRIPTION_MAX_CHARS,
      Math.min(this.maxTaskDescriptionChars, 6_000),
    );
    this.economyMaxTaskDescriptionChars = Math.min(economyTaskLimitRaw, this.maxTaskDescriptionChars);

    const economyToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.ECONOMY_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 6_000),
    );
    this.economyToolOutputStringLimit = Math.min(economyToolOutputLimitRaw, this.toolOutputStringLimit);

    const economyToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.ECONOMY_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 15_000),
    );
    this.economyToolOutputSerializedLimit = Math.min(
      economyToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );

    const economyHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.ECONOMY_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 8_000),
    );
    this.economyHttpToolMaxResponseChars = Math.min(economyHttpMaxCharsRaw, this.httpToolMaxResponseChars);

    const smartEconomyTaskLimitRaw = this.parsePositiveInteger(
      process.env.SMART_ECONOMY_TASK_DESCRIPTION_MAX_CHARS,
      Math.min(this.maxTaskDescriptionChars, 10_000),
    );
    this.smartEconomyMaxTaskDescriptionChars = Math.min(smartEconomyTaskLimitRaw, this.maxTaskDescriptionChars);

    const smartEconomyToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.SMART_ECONOMY_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 10_000),
    );
    this.smartEconomyToolOutputStringLimit = Math.min(
      smartEconomyToolOutputLimitRaw,
      this.toolOutputStringLimit,
    );

    const smartEconomyToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.SMART_ECONOMY_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 40_000),
    );
    this.smartEconomyToolOutputSerializedLimit = Math.min(
      smartEconomyToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );

    const smartEconomyHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.SMART_ECONOMY_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 15_000),
    );
    this.smartEconomyHttpToolMaxResponseChars = Math.min(
      smartEconomyHttpMaxCharsRaw,
      this.httpToolMaxResponseChars,
    );

    const ecoOneTaskLimitRaw = this.parsePositiveInteger(
      process.env.ECO1_TASK_DESCRIPTION_MAX_CHARS,
      Math.min(this.maxTaskDescriptionChars, 5_000),
    );
    this.ecoOneMaxTaskDescriptionChars = Math.min(ecoOneTaskLimitRaw, this.maxTaskDescriptionChars);

    const ecoOneToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.ECO1_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 4_000),
    );
    this.ecoOneToolOutputStringLimit = Math.min(ecoOneToolOutputLimitRaw, this.toolOutputStringLimit);

    const ecoOneToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.ECO1_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 12_000),
    );
    this.ecoOneToolOutputSerializedLimit = Math.min(
      ecoOneToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );

    const ecoOneHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.ECO1_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 6_000),
    );
    this.ecoOneHttpToolMaxResponseChars = Math.min(
      ecoOneHttpMaxCharsRaw,
      this.httpToolMaxResponseChars,
    );

    const chatgptCodexTaskLimitRaw = this.parsePositiveInteger(
      process.env.CHATGPT_CODEX_TASK_DESCRIPTION_MAX_CHARS,
      Math.min(this.maxTaskDescriptionChars, 9_000),
    );
    this.chatgptCodexMaxTaskDescriptionChars = Math.min(
      chatgptCodexTaskLimitRaw,
      this.maxTaskDescriptionChars,
    );

    const chatgptCodexToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.CHATGPT_CODEX_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 9_000),
    );
    this.chatgptCodexToolOutputStringLimit = Math.min(
      chatgptCodexToolOutputLimitRaw,
      this.toolOutputStringLimit,
    );

    const chatgptCodexToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.CHATGPT_CODEX_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 30_000),
    );
    this.chatgptCodexToolOutputSerializedLimit = Math.min(
      chatgptCodexToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );

    const chatgptCodexHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.CHATGPT_CODEX_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 14_000),
    );
    this.chatgptCodexHttpToolMaxResponseChars = Math.min(
      chatgptCodexHttpMaxCharsRaw,
      this.httpToolMaxResponseChars,
    );

    this.ecoTwoAutoCompactTokenLimit = this.parsePositiveInteger(
      process.env.ECO2_AUTO_COMPACT_TOKEN_LIMIT,
      1_000_000,
    );
    const ecoTwoHistoryTargetRaw = this.parsePositiveInteger(
      process.env.ECO2_HISTORY_TARGET_TOKENS,
      Math.min(this.ecoTwoAutoCompactTokenLimit, 800_000),
    );
    this.ecoTwoHistoryTargetTokens = Math.min(
      ecoTwoHistoryTargetRaw,
      this.ecoTwoAutoCompactTokenLimit,
    );

    const ecoTwoUserLimitRaw = this.parsePositiveInteger(
      process.env.ECO2_USER_MESSAGE_TOKEN_LIMIT,
      20_000,
    );
    this.ecoTwoUserMessageTokenLimit = Math.min(ecoTwoUserLimitRaw, 50_000);

    const ecoTwoToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.ECO2_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 5_000),
    );
    this.ecoTwoToolOutputStringLimit = Math.min(
      ecoTwoToolOutputLimitRaw,
      this.toolOutputStringLimit,
    );

    const ecoTwoToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.ECO2_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 18_000),
    );
    this.ecoTwoToolOutputSerializedLimit = Math.min(
      ecoTwoToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );

    const ecoTwoHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.ECO2_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 10_000),
    );
    this.ecoTwoHttpToolMaxResponseChars = Math.min(
      ecoTwoHttpMaxCharsRaw,
      this.httpToolMaxResponseChars,
    );

    this.ecoTwoCharsPerTokenEstimate = this.parsePositiveInteger(
      process.env.ECO2_APPROX_CHARS_PER_TOKEN,
      4,
    );

    this.ecoTwoMaxIdenticalToolAttempts = Math.max(
      2,
      this.parsePositiveInteger(process.env.ECO2_MAX_IDENTICAL_TOOL_ATTEMPTS, 3),
    );
    this.ecoTwoLoopHistorySize = Math.max(
      this.ecoTwoMaxIdenticalToolAttempts,
      this.parsePositiveInteger(
        process.env.ECO2_LOOP_HISTORY_SIZE,
        this.ecoTwoMaxIdenticalToolAttempts * 3,
      ),
    );

    this.ecoThreeAutoCompactTokenLimit = this.parsePositiveInteger(
      process.env.ECO3_AUTO_COMPACT_TOKEN_LIMIT,
      600_000,
    );
    const ecoThreeHistoryTargetRaw = this.parsePositiveInteger(
      process.env.ECO3_HISTORY_TARGET_TOKENS,
      Math.min(this.ecoThreeAutoCompactTokenLimit, 450_000),
    );
    this.ecoThreeHistoryTargetTokens = Math.min(
      ecoThreeHistoryTargetRaw,
      this.ecoThreeAutoCompactTokenLimit,
    );
    const ecoThreeUserLimitRaw = this.parsePositiveInteger(
      process.env.ECO3_USER_MESSAGE_TOKEN_LIMIT,
      10_000,
    );
    this.ecoThreeUserMessageTokenLimit = Math.min(ecoThreeUserLimitRaw, 30_000);
    const ecoThreeToolOutputLimitRaw = this.parsePositiveInteger(
      process.env.ECO3_TOOL_OUTPUT_STRING_LIMIT,
      Math.min(this.toolOutputStringLimit, 3_000),
    );
    this.ecoThreeToolOutputStringLimit = Math.min(
      ecoThreeToolOutputLimitRaw,
      this.toolOutputStringLimit,
    );
    const ecoThreeToolOutputSerializedLimitRaw = this.parsePositiveInteger(
      process.env.ECO3_TOOL_OUTPUT_SERIALIZED_LIMIT,
      Math.min(this.toolOutputSerializedLimit, 12_000),
    );
    this.ecoThreeToolOutputSerializedLimit = Math.min(
      ecoThreeToolOutputSerializedLimitRaw,
      this.toolOutputSerializedLimit,
    );
    const ecoThreeHttpMaxCharsRaw = this.parsePositiveInteger(
      process.env.ECO3_HTTP_TOOL_MAX_RESPONSE_CHARS,
      Math.min(this.httpToolMaxResponseChars, 8_000),
    );
    this.ecoThreeHttpToolMaxResponseChars = Math.min(
      ecoThreeHttpMaxCharsRaw,
      this.httpToolMaxResponseChars,
    );
    this.ecoThreeMaxTurns = this.parsePositiveInteger(process.env.ECO3_MAX_TURNS, 120);
    this.ecoThreeMaxTotalTokens = this.parsePositiveInteger(
      process.env.ECO3_MAX_TOTAL_TOKENS,
      800_000,
    );

    this.dbQueryTimeoutMs = this.parsePositiveInteger(process.env.DB_QUERY_TIMEOUT_MS, 10_000);
    this.dbMaxRows = this.parsePositiveInteger(process.env.DB_QUERY_MAX_ROWS, 200);
    this.prCreateMaxAttempts = Math.max(1, this.parsePositiveInteger(process.env.PR_CREATE_RETRY_ATTEMPTS, 3));
    this.prCreateRetryDelayMs = this.parsePositiveInteger(process.env.PR_CREATE_RETRY_DELAY_MS, 1_500);
    this.dbConfigFromEnv = this.loadDatabaseConfig();
  }

  async process(job: SandboxJob): Promise<void> {
    if (job.cancelRequested) {
      const now = new Date().toISOString();
      job.status = 'CANCELLED';
      job.startedAt = job.startedAt ?? now;
      job.finishedAt = job.finishedAt ?? now;
      job.updatedAt = now;
      job.durationMs = job.durationMs ?? 0;
      return;
    }

    job.profile = (job.profile ?? 'STANDARD') as SandboxProfile;
    const resolvedModel = this.resolveModel(job);
    job.model = resolvedModel;
    job.timeoutCount = job.timeoutCount ?? 0;
    job.interactions = Array.isArray(job.interactions) ? job.interactions : [];
    job.interactionSequence = Number.isFinite(job.interactionSequence) ? job.interactionSequence : 0;
    job.httpGetCount = job.httpGetCount ?? 0;
    job.httpGetSuccessCount = job.httpGetSuccessCount ?? 0;
    job.httpRequests = Array.isArray(job.httpRequests) ? job.httpRequests : [];
    job.dbQueryCount = job.dbQueryCount ?? 0;

    const start = new Date();
    job.startedAt = job.startedAt ?? start.toISOString();
    job.updatedAt = job.startedAt;
    job.status = 'RUNNING';

    let workspace: string | undefined;
    let repoPath: string | undefined;

    try {
      this.ensureNotCancelled(job);
      workspace = await this.prepareWorkspace(job);
      repoPath = path.join(workspace, 'repo');
      job.sandboxPath = workspace;
      this.log(job, `workspace criado em ${workspace}`);
      this.log(job, `perfil ${job.profile} selecionado; modelo ${resolvedModel}`);
      if (this.isEconomy(job)) {
        this.log(
          job,
          `modo econômico: limite prompt=${this.economyMaxTaskDescriptionChars}, toolOutput=${this.economyToolOutputStringLimit}, http_get=${this.economyHttpToolMaxResponseChars}`,
        );
      } else if (this.isSmartEconomy(job)) {
        this.log(
          job,
          `modo econômico inteligente: limite prompt=${this.smartEconomyMaxTaskDescriptionChars}, toolOutput=${this.smartEconomyToolOutputStringLimit}, http_get=${this.smartEconomyHttpToolMaxResponseChars}`,
        );
      } else if (this.isEcoOne(job)) {
        this.log(
          job,
          `modo ECO-1: limite prompt=${this.ecoOneMaxTaskDescriptionChars}, toolOutput=${this.ecoOneToolOutputStringLimit}, http_get=${this.ecoOneHttpToolMaxResponseChars}`,
        );
      } else if (this.isEcoTwo(job)) {
        this.log(
          job,
          `modo ECO-2: auto-compact=${this.ecoTwoAutoCompactTokenLimit} tokens, histórico alvo=${this.ecoTwoHistoryTargetTokens}, toolOutput=${this.ecoTwoToolOutputStringLimit}, http_get=${this.ecoTwoHttpToolMaxResponseChars}`,
        );
      } else if (this.isEcoThree(job)) {
        this.log(
          job,
          `modo ECO-3: auto-compact=${this.ecoThreeAutoCompactTokenLimit} tokens, histórico alvo=${this.ecoThreeHistoryTargetTokens}, toolOutput=${this.ecoThreeToolOutputStringLimit}, http_get=${this.ecoThreeHttpToolMaxResponseChars}, turns=${this.ecoThreeMaxTurns}, tokens_max=${this.ecoThreeMaxTotalTokens}`,
        );
      } else if (this.isChatgptCodex(job)) {
        this.log(
          job,
          `modo ChatGPT Codex: limite prompt=${this.chatgptCodexMaxTaskDescriptionChars}, toolOutput=${this.chatgptCodexToolOutputStringLimit}, http_get=${this.chatgptCodexHttpToolMaxResponseChars}`,
        );
      }

      this.ensureNotCancelled(job);
      const githubAuth = this.resolveGithubAuth(job);
      if (githubAuth.token) {
        this.log(
          job,
          `token GitHub obtido de ${githubAuth.source} será usado para clone, push e criação de PR`,
        );
      } else {
        this.log(job, 'nenhum token GitHub configurado; operações autenticadas podem falhar');
      }

      const cloneUrl = buildAuthRepoUrl(job.repoUrl, githubAuth.token, githubAuth.username);
      this.log(job, `clonando repositório ${redactUrlCredentials(cloneUrl)} (branch ${job.branch})`);
      await this.cloneRepository(job, repoPath!, cloneUrl);
      this.ensureNotCancelled(job);
      const baseCommit = await this.getHeadCommit(repoPath!);
      if (!this.openai) {
        throw new Error('OPENAI_API_KEY não configurada no sandbox orchestrator');
      }

      this.ensureNotCancelled(job);
      this.log(job, `iniciando interação com o modelo do sandbox (${resolvedModel})`);
      const summary = await this.runCodexLoop(job, repoPath!, resolvedModel);
      job.summary = summary;
      this.ensureNotCancelled(job);
      job.changedFiles = await this.collectChangedFiles(repoPath!, baseCommit, job);
      this.ensureNotCancelled(job);
      job.patch = await this.generatePatch(repoPath!, baseCommit, job);
      this.ensureNotCancelled(job);
      await this.runConfiguredTestCommand(job, repoPath!);
      this.ensureNotCancelled(job);
      await this.maybeCreatePullRequest(job, repoPath!, githubAuth, baseCommit, job.patch);
      this.log(job, 'job concluído com sucesso, coletando patch e arquivos alterados');
      job.status = 'COMPLETED';
      job.finishedAt = new Date().toISOString();
    } catch (error) {
      if (error instanceof JobCancelledError) {
        job.status = 'CANCELLED';
        job.error = undefined;
        this.log(job, 'job cancelado pelo usuário');
      } else {
        job.status = 'FAILED';
        job.error = error instanceof Error ? error.message : String(error);
        this.log(job, `falha ao processar job: ${job.error}`);
      }
    } finally {
      if (workspace) {
        this.log(job, `limpando workspace ${workspace}`);
        await this.cleanup(workspace);
      }
      await this.disposeDbPool(job.jobId);
      const finished = job.finishedAt ? new Date(job.finishedAt) : new Date();
      job.finishedAt = finished.toISOString();
      job.updatedAt = job.finishedAt;
      if (job.startedAt) {
        const startMs = Date.parse(job.startedAt);
        if (Number.isFinite(startMs)) {
          job.durationMs = Math.max(0, finished.getTime() - startMs);
        }
      }
      await this.sendCallback(job);
    }
  }

  private ensureNotCancelled(job: SandboxJob): void {
    if (job.cancelRequested) {
      throw new JobCancelledError();
    }
  }

  private async prepareWorkspace(job: SandboxJob): Promise<string> {
    const baseDir = path.resolve(process.env.SANDBOX_WORKDIR ?? os.tmpdir());
    const sandboxEnv = process.env.SANDBOX_WORKDIR ?? '<não definido>';
    this.log(job, `preparando workspace (SANDBOX_WORKDIR=${sandboxEnv}) em ${baseDir}`);
    try {
      await fs.mkdir(baseDir, { recursive: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(job, `falha ao criar diretório base ${baseDir}: ${message}`);
      throw new Error(`não foi possível preparar diretório base ${baseDir}: ${message}`);
    }

    try {
      const workspace = await fs.mkdtemp(path.join(baseDir, `ai-hub-${job.jobId}-`));
      this.log(job, `workspace temporário usando ${baseDir} criado com prefixo ai-hub-${job.jobId}-`);
      return workspace;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const baseDirStatus = await this.describePathStatus(baseDir);
      this.log(
        job,
        `falha ao criar workspace temporário em ${baseDir}: ${message} (status do diretório base: ${baseDirStatus})`,
      );
      throw new Error(`não foi possível criar workspace temporário em ${baseDir}: ${message}`);
    }
  }

  private resolveGithubAuth(job: SandboxJob): { token?: string; username: string; source: string } {
    const username = process.env.GITHUB_CLONE_USERNAME ?? 'x-access-token';
    const candidates: Array<{ token?: string; source: string }> = [
      { token: process.env.GITHUB_CLONE_TOKEN, source: 'GITHUB_CLONE_TOKEN' },
      { token: process.env.GITHUB_TOKEN, source: 'GITHUB_TOKEN' },
      { token: process.env.GITHUB_PR_TOKEN, source: 'GITHUB_PR_TOKEN' },
      { token: extractTokenFromRepoUrl(job.repoUrl), source: 'repoUrl' },
    ];

    const selected = candidates.find((candidate) => candidate.token);
    return { token: selected?.token, username, source: selected?.source ?? 'nenhum' };
  }

  private async cleanup(workspace: string): Promise<void> {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
    } catch (err) {
      // noop
    }
  }

  private async cloneRepository(job: SandboxJob, repoPath: string, cloneUrl: string): Promise<void> {
    await exec(`git clone --branch ${job.branch} --depth 1 ${cloneUrl} ${repoPath}`);
    if (job.commitHash) {
      this.log(job, `checando commit ${job.commitHash}`);
      await exec(`git checkout ${job.commitHash}`, { cwd: repoPath });
    }
  }

  private buildTools(repoPath: string) {
    return [
      {
        type: 'function' as const,
        name: 'run_shell',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'array', items: { type: 'string' } },
            cwd: { type: 'string', description: 'Diretório relativo ao repo' },
          },
          required: ['command', 'cwd'],
          additionalProperties: false,
        },
        strict: true,
        description: 'Executa um comando de shell dentro do sandbox clonado',
      },
      {
        type: 'function' as const,
        name: 'read_file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
          additionalProperties: false,
        },
        strict: true,
        description: 'Lê um arquivo do repositório clonado',
      },
      {
        type: 'function' as const,
        name: 'write_file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['path', 'content'],
          additionalProperties: false,
        },
        strict: true,
        description: 'Escreve um arquivo dentro do repositório clonado',
      },
      {
        type: 'function' as const,
        name: 'http_get',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL http(s) pública para consulta' },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Cabeçalhos opcionais; Authorization é ignorado',
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
        strict: true,
        description:
          'Busca um recurso público via HTTP GET (bloqueia hosts internos e localhost); consulte documentação oficial de APIs externas antes de integrá-las',
      },
      {
        type: 'function' as const,
        name: 'WebSearch',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL http(s) pública para consulta' },
            headers: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Cabeçalhos opcionais; Authorization é ignorado',
            },
          },
          required: ['url'],
          additionalProperties: false,
        },
        strict: true,
        description:
          'Alias de http_get para buscar conteúdos públicos na web bloqueando hosts internos/localhost',
      },
      {
        type: 'function' as const,
        name: 'db_query',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Instrução SQL de leitura (apenas SELECT)' },
            limit: {
              type: 'integer',
              description: `Limite máximo de linhas a retornar (padrão ${this.dbMaxRows}, máximo ${this.dbMaxRows})`,
            },
          },
          required: ['query', 'limit'],
          additionalProperties: false,
        },
        strict: true,
        description: 'Executa uma consulta SELECT no banco de dados configurado para este ambiente (não usa o banco principal da aplicação)',
      },
    ];
  }

  private async runCodexLoop(job: SandboxJob, repoPath: string, model: string): Promise<string> {
    this.ensureNotCancelled(job);
    job.taskDescription = this.sanitizeTaskDescription(job.taskDescription, job);

    const tools = this.buildTools(repoPath);
    const profileInstruction = this.isEconomy(job)
      ? `
Modo econômico ativo: minimize leituras extensas, priorize comandos curtos, escreva respostas objetivas e evite reexecuções desnecessárias.`
      : this.isSmartEconomy(job)
        ? `
Modo econômico inteligente ativo: aproveite estratégias enxutas (reutilizar resultados, evitar loops desnecessários) sem abrir mão da validação completa. Justifique quando precisar executar comandos mais longos e confirme se a cobertura da tarefa permanece adequada.`
        : this.isEcoOne(job)
          ? `
Modo ECO-1 ativo: siga o plano descrito em docs/estrategia-token/modo-eco1.md — limite o carregamento de instruções fixas (project_doc_max_bytes), corte e resuma outputs de tools antes de salvá-los, force compaction sempre que o histórico se aproximar do limite do modelo, trate imagens inline como estimativas fixas e aceite automaticamente o nudge para modelos econômicos ao atingir 90% do orçamento. Registre todas as truncagens para que o time saiba o que ficou de fora.`
          : this.isEcoTwo(job)
            ? `
Modo ECO-2 ativo: cumpra as rotinas descritas em docs/estrategia-token/modo-eco2.md — monitore total_usage_tokens e rode compactações automáticas assim que ultrapassar o limite configurado, execute uma compactação preventiva antes de cada turno e sempre que trocar para um modelo com janela menor, escolha entre compactação local e remota conforme o provedor, mantenha no máximo 20k tokens de mensagens de usuário (truncando e registrando excessos), pode chamadas de função/tool mais antigas antes de enviar o histórico para o compactador e trunque as saídas de ferramentas antes de devolvê-las ao modelo e abandone loops detectados: se precisar repetir a mesma tool explique o que mudou, caso contrário o sandbox bloqueará tentativas idênticas para poupar tokens.`
            : this.isEcoThree(job)
              ? `
Modo ECO-3 ativo: siga o protocolo descrito em docs/estrategia-token/modo-eco3.md — transforme logs longos em resumos antes de reenviá-los, limite as janelas de histórico a blocos pequenos, pare loops que ultrapassem os limites de iterações/tokens e sempre documente o que foi descartado para manter rastreabilidade.`
              : this.isChatgptCodex(job)
              ? `
Modo ChatGPT Codex ativo: replique a experiência do app (chatgpt.com/codex) descrita em docs/estrategia-token/chatgpt-codex.md — organize squads paralelos, abra worktrees ou diretórios codex/<squad> para separar fluxos, registre owners/risco/custos a cada checkpoint, reutilize resultados entre agentes e prefira execuções curtas em ambientes em nuvem antes de compartilhar resumos objetivos.`
              : '';
    const messages: ResponseItem[] = [
      {
        type: 'message',
        id: this.sanitizeId('msg_system'),
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `Você está operando em um sandbox isolado em ${repoPath}. Use as tools para ler, alterar arquivos e executar comandos. Test command sugerido: ${
              job.testCommand ?? 'n/d'
            }. Sempre trabalhe somente dentro do diretório do repositório. Prefira usar o comando rg para buscas recursivas em vez de grep -R, que é mais lento. Não deixe para o usuário tarefas que você consegue executar: se precisar ajustar arquivos, criar commits, atualizar PR ou escrever mensagens, faça você mesmo. Só peça intervenção humana quando for impossível concluir algo dentro do sandbox (por exemplo, falta de credenciais ou acesso externo). Sempre verifique se o objetivo da tarefa foi cumprido executando ou detalhando os testes relevantes (use o comando de testes sugerido quando existir) e relate claramente os resultados. O resumo final e qualquer explicação para PRs devem ser escritos em português. Para integrações com APIs externas, busque e cite a documentação oficial usando a tool http_get antes de implementar.

Se a tarefa envolver criação ou alteração de migrations Liquibase, consulte docs/database/liquibase-mysql57.md e siga estas regras:
- Gere arquivos YAML com raiz 'databaseChangeLog' e inclua-os em apps/backend/src/main/resources/db/changelog/changelog-master.yaml quando necessário.
- Defina 'id' e 'author' consistentes, utilize preConditions com dbms (onFail: MARK_RAN) e marque cada bloco SQL com dbms: mysql.
- O alvo padrão é MySQL 5.7: evite recursos não suportados (CTE/'WITH', window functions, CHECK constraints) e, quando precisar de workarounds, descreva-os.
- Prefira splitStatements: true, stripComments: true, ENGINE=InnoDB e valide o SQL mentalmente como se fosse executado via 'liquibase updateSQL' antes de finalizar.
- Use os exemplos existentes em db/changelog/changeset-001-create-users.yaml como referência para formatação, nomenclatura e estruturas adicionais.
${profileInstruction}`,
          },
        ],
      },
      {
        type: 'message',
        id: this.sanitizeId('msg_user'),
        role: 'user',
        content: [{ type: 'input_text', text: job.taskDescription }],
      },
    ];

    let summary = '';
    let turnCount = 0;
    this.log(job, 'loop do modelo iniciado; aguardando chamadas de ferramenta');

    while (true) {
      this.ensureNotCancelled(job);
      turnCount++;
      this.enforceEcoThreeGuardrails(job, turnCount);
      this.applyEcoPreSamplingCompaction(job, messages);
      this.log(job, `enviando mensagens para o modelo (mensagens=${messages.length}, tools=${tools.length})`);
      this.ensureNotCancelled(job);
      const outboundInteraction = this.recordInteraction(
        job,
        'OUTBOUND',
        this.formatMessagesForRecording(messages),
      );
      const response = await this.openai!.responses.create({
        model,
        input: messages,
        tools,
      });
      this.log(
        job,
        `resposta do modelo recebida (responseId=${response.id ?? 'n/d'}, output_items=${(response.output ?? []).length})`,
      );

      const usageMetrics = this.addUsageMetrics(job, (response as any).usage);
      this.enforceEcoThreeGuardrails(job, turnCount);

      const output = response.output ?? [];
      const normalizedOutput: ResponseItem[] = output.map((item, index) => {
        if (item.type === 'function_call') {
          const callId = this.extractCallId(item, index);
          const messageId = this.sanitizeId(item.id ?? callId);
          return { ...item, id: messageId, call_id: callId } as ResponseItem;
        }
        return item as ResponseItem;
      });
      const assistantMessage = normalizedOutput.find((item) => item.type === 'message') as ResponseOutputMessage | undefined;
      const toolCalls = normalizedOutput.filter((item) => item.type === 'function_call') as ResponseFunctionToolCallItem[];

      const toolCallDetails =
        toolCalls
          .map((call, idx) => {
      const inboundInteraction = this.recordInteraction(
        job,
        'INBOUND',
        this.formatMessagesForRecording(normalizedOutput),
      );

      if (usageMetrics?.promptTokens !== undefined) {
        outboundInteraction.tokenCount = usageMetrics.promptTokens;
      }
      if (usageMetrics?.completionTokens !== undefined) {
        inboundInteraction.tokenCount = usageMetrics.completionTokens;
      }

            const callId = call.call_id ?? this.extractCallId(call, idx);
            return `${call.name ?? 'sem_nome'}(callId=${callId}, id=${call.id ?? 'n/d'})`;
          })
          .join(', ') || 'nenhum';
      const assistantTextPreview = this.truncate(this.extractOutputText(assistantMessage?.content) ?? '', 240);
      this.log(
        job,
        `modelo retornou ${toolCalls.length} chamadas de ferramenta e mensagem=${Boolean(
          assistantMessage,
        )} (toolCalls=[${toolCallDetails}], textPreview="${assistantTextPreview}")`,
      );

      const text = this.extractOutputText(assistantMessage?.content);
      if (toolCalls.length === 0) {
        summary = text ?? summary;
        if (assistantMessage) {
          messages.push(assistantMessage);
        }
        this.log(job, `resumo final do modelo: "${this.truncate(summary, 240)}"`);
        this.log(job, 'modelo concluiu sem novas tool calls');
        return summary;
      }

      messages.push(...normalizedOutput);

      const toolMessages: ResponseFunctionToolCallOutputItem[] = [];
      for (const [index, call] of toolCalls.entries()) {
        this.ensureNotCancelled(job);
        const parsedArgs = this.parseArguments(call.arguments);
        const callId = call.call_id ?? this.extractCallId(call, index);
        const outputId = this.normalizeFunctionCallOutputId(callId, `call_${index}`);
        const toolCall: ToolCall = {
          id: callId,
          name: call.name ?? '',
          arguments: parsedArgs ?? {},
        };
        const toolSignature = this.buildToolSignature(toolCall);
        const loopBlock = this.evaluateEcoTwoLoopBlock(job, toolSignature, toolCall.name ?? '');
        if (loopBlock) {
          this.log(job, loopBlock.logMessage);
          const blockOutput = this.prepareToolOutput(loopBlock.payload, job);
          toolMessages.push({
            id: outputId,
            call_id: callId,
            output: blockOutput,
            type: 'function_call_output',
          });
          continue;
        }
        this.log(
          job,
          `executando tool ${toolCall.name} (callId=${callId}, args=${JSON.stringify(toolCall.arguments)})`,
        );
        try {
          const result = await this.dispatchTool(toolCall, repoPath, job);
          this.logJson(job, `resultado da tool ${toolCall.name} (callId=${callId})`, result);
          const preparedOutput = this.prepareToolOutput(result, job);
          toolMessages.push({
            id: outputId,
            call_id: callId,
            output: preparedOutput,
            type: 'function_call_output',
          });
          this.recordEcoTwoLoopAttempt(job, toolSignature, toolCall.name ?? '', preparedOutput);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log(job, `erro ao executar tool ${toolCall.name}: ${message}`);
          const errorPayload = { error: message };
          const preparedOutput = this.prepareToolOutput(errorPayload, job);
          toolMessages.push({
            id: outputId,
            call_id: callId,
            output: preparedOutput,
            type: 'function_call_output',
          });
          this.recordEcoTwoLoopAttempt(job, toolSignature, toolCall.name ?? '', preparedOutput);
        }
      }

      messages.push(...toolMessages);
      this.enforceEcoAutoCompaction(job, messages);
    }
  }

  private formatMessagesForRecording(items: ResponseItem[]): string {
    if (!Array.isArray(items) || items.length === 0) {
      return '';
    }
    return items
      .map((item, index) => this.formatSingleResponseItem(item, index))
      .join("\\n\\n---\\n\\n");
  }

  private formatSingleResponseItem(item: ResponseItem, index: number): string {
    switch (item.type) {
      case 'message': {
        const message = item as ResponseOutputMessage;
        const role = message.role ?? 'assistant';
        const text = this.collectMessageTexts(message.content);
        return `[${role}]\n${text}`;
      }
      case 'function_call': {
        const call = item as ResponseFunctionToolCallItem;
        const args =
          typeof call.arguments === 'string'
            ? call.arguments
            : this.safeStringify(call.arguments ?? {});
        const callId = call.call_id ?? call.id ?? `call_${index}`;
        const name = call.name ?? 'sem_nome';
        return `[tool_call:${name}] id=${callId}\n${args}`;
      }
      case 'function_call_output': {
        const output = item as ResponseFunctionToolCallOutputItem;
        const callId = output.call_id ?? `call_${index}`;
        const rendered =
          typeof output.output === 'string' ? output.output : this.safeStringify(output.output ?? {});
        return `[tool_result:${callId}]\n${rendered}`;
      }
      default: {
        return `[${item.type}] ${this.safeStringify(item)}`;
      }
    }
  }

  private collectMessageTexts(content: ResponseOutputMessage['content'] | undefined): string {
    if (!Array.isArray(content) || content.length === 0) {
      return '';
    }
    const segments: string[] = [];
    for (const entry of content) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      if ('text' in entry && typeof (entry as any).text === 'string') {
        const value = ((entry as any).text as string).trim();
        if (value) {
          segments.push(value);
        }
      } else if ('content' in entry && typeof (entry as any).content === 'string') {
        const value = ((entry as any).content as string).trim();
        if (value) {
          segments.push(value);
        }
      }
    }
    if (segments.length === 0) {
      return this.safeStringify(content);
    }
    return segments.join("\\n");
  }

  private safeStringify(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key, this.stableStringify(val)] as const)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${val}`);
    return `{${entries.join(',')}}`;
  }

  private buildToolSignature(call: ToolCall): string {
    const argsKey = this.stableStringify(call.arguments ?? {});
    const toolName = call.name?.trim() || 'desconhecida';
    return `${toolName}::${argsKey}`;
  }

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isEcoTwoLoopGuardedTool(toolName?: string): boolean {
    if (!toolName) {
      return false;
    }
    return ECO_TWO_LOOP_GUARDED_TOOLS.has(toolName);
  }

  private getEcoTwoLoopState(job: SandboxJob): EcoTwoLoopState {
    let state = this.ecoTwoLoopStates.get(job);
    if (!state) {
      state = { attempts: [], blockedCount: 0 };
      this.ecoTwoLoopStates.set(job, state);
    }
    return state;
  }

  private evaluateEcoTwoLoopBlock(
    job: SandboxJob,
    signature: string,
    toolName: string,
  ): EcoTwoLoopBlockResult | undefined {
    if (!this.isEcoTwo(job) || !this.isEcoTwoLoopGuardedTool(toolName)) {
      return undefined;
    }
    if (this.ecoTwoMaxIdenticalToolAttempts <= 1) {
      return undefined;
    }
    const state = this.getEcoTwoLoopState(job);
    const recent = state.attempts.slice(-this.ecoTwoMaxIdenticalToolAttempts);
    if (recent.length < this.ecoTwoMaxIdenticalToolAttempts) {
      return undefined;
    }
    if (!recent.every((attempt) => attempt.signature === signature)) {
      return undefined;
    }
    const uniqueOutputs = new Set(recent.map((attempt) => attempt.outputHash));
    if (uniqueOutputs.size !== 1) {
      return undefined;
    }
    state.blockedSignature = signature;
    state.blockedCount += 1;
    const attempts = this.ecoTwoMaxIdenticalToolAttempts;
    return {
      payload: {
        error: 'Modo ECO-2 bloqueou a execução repetida desta tool.',
        tool: toolName || 'desconhecida',
        attemptsConsidered: attempts,
        guidance:
          'Revise o plano, edite os arquivos necessários ou explique o que mudou antes de repetir o mesmo comando.',
      },
      logMessage: `Modo ECO-2: loop bloqueado para ${toolName || 'tool'} após ${attempts} respostas idênticas.`,
    };
  }

  private recordEcoTwoLoopAttempt(
    job: SandboxJob,
    signature: string,
    toolName: string,
    preparedOutput: string,
  ): void {
    if (!this.isEcoTwo(job) || !this.isEcoTwoLoopGuardedTool(toolName)) {
      return;
    }
    const state = this.getEcoTwoLoopState(job);
    const attempt: EcoTwoLoopAttempt = {
      signature,
      toolName,
      outputHash: this.hashString(preparedOutput),
      timestamp: Date.now(),
    };
    state.attempts.push(attempt);
    if (state.attempts.length > this.ecoTwoLoopHistorySize) {
      state.attempts.splice(0, state.attempts.length - this.ecoTwoLoopHistorySize);
    }
  }

  private resetEcoTwoLoopAttempts(job: SandboxJob, reason?: string): void {
    if (!this.isEcoTwo(job)) {
      return;
    }
    const state = this.ecoTwoLoopStates.get(job);
    if (!state || state.attempts.length === 0) {
      return;
    }
    state.attempts.length = 0;
    state.blockedSignature = undefined;
    if (reason) {
      this.log(job, `Modo ECO-2: histórico de tentativas idênticas redefinido (${reason}).`);
    }
  }

  private recordInteraction(
    job: SandboxJob,
    direction: SandboxInteraction['direction'],
    content: string,
    tokenCount?: number,
  ): SandboxInteraction {
    const createdAt = new Date().toISOString();
    const currentSequence = Number.isFinite(job.interactionSequence) ? job.interactionSequence + 1 : 1;
    job.interactionSequence = currentSequence;
    const sequence = currentSequence;
    const identifier = `${job.jobId}-${String(sequence).padStart(4, '0')}-${direction.toLowerCase()}`;
    const interaction: SandboxInteraction = {
      id: identifier,
      direction,
      content: typeof content === 'string' ? content : this.safeStringify(content),
      tokenCount,
      createdAt,
      sequence,
    };
    job.interactions.push(interaction);
    return interaction;
  }

  private extractOutputText(content: ResponseOutputMessage['content'] | undefined): string | undefined {
    if (!Array.isArray(content)) {
      return undefined;
    }
    const texts = content
      .filter((item) => item.type === 'output_text')
      .map((item) => (item as ResponseOutputText).text.trim())
      .filter((text) => text.length > 0);

    if (texts.length === 0) {
      return undefined;
    }
    return texts.join('\n').trim();
  }

  private async runConfiguredTestCommand(job: SandboxJob, repoPath: string): Promise<void> {
    const rawCommand = typeof job.testCommand === 'string' ? job.testCommand : '';
    const normalized = rawCommand.trim();
    if (!normalized) {
      this.log(job, 'nenhum testCommand configurado; pulando verificação automática de compilação/testes');
      return;
    }

    const label = this.truncate(normalized.replace(/\s+/g, ' '), 200);
    this.log(job, `executando testCommand configurado para validar compilação/testes: ${label}`);

    const result = await this.handleRunShell(
      { command: ['bash', '-lc', rawCommand], cwd: '.' },
      repoPath,
      job,
    );

    const exitCode = result.exitCode ?? 0;
    const failed = result.timedOut || (result.signal ?? null) !== null || exitCode !== 0;
    if (failed) {
      const failureDetail = result.timedOut
        ? 'tempo limite excedido'
        : result.signal
          ? `processo interrompido com sinal ${result.signal}`
          : `exitCode ${exitCode}`;
      const stderrSnippet = this.truncate((result.stderr ?? '').trim(), 400);
      const stdoutSnippet = this.truncate((result.stdout ?? '').trim(), 400);
      const outputHint = stderrSnippet
        ? `stderr: ${stderrSnippet}`
        : stdoutSnippet
          ? `stdout: ${stdoutSnippet}`
          : 'verifique os logs do sandbox para detalhes.';
      throw new Error(`testCommand "${label}" falhou (${failureDetail}). ${outputHint}`);
    }

    this.log(job, `testCommand finalizado com sucesso (exitCode=${exitCode})`);
  }

  private addUsageMetrics(job: SandboxJob, usage: unknown): TokenUsage | undefined {
    if (!usage || typeof usage !== 'object') {
      return undefined;
    }

    const source = usage as Record<string, unknown>;
    const promptTokens = this.readNumberField(source, ['prompt_tokens', 'input_tokens', 'promptTokens']);
    const completionTokens = this.readNumberField(source, [
      'completion_tokens',
      'output_tokens',
      'completionTokens',
    ]);
    const totalTokens =
      this.readNumberField(source, ['total_tokens', 'totalTokens']) ??
      (promptTokens !== undefined && completionTokens !== undefined ? promptTokens + completionTokens : undefined);
    const cost = this.readNumberField(source, ['total_cost', 'cost']);

    if (promptTokens !== undefined) {
      job.promptTokens = (job.promptTokens ?? 0) + promptTokens;
    }
    if (completionTokens !== undefined) {
      job.completionTokens = (job.completionTokens ?? 0) + completionTokens;
    }
    if (totalTokens !== undefined) {
      job.totalTokens = (job.totalTokens ?? 0) + totalTokens;
    }
    if (cost !== undefined) {
      job.cost = (job.cost ?? 0) + cost;
    }

    return { promptTokens, completionTokens, totalTokens, cost };
  }

  private readNumberField(source: Record<string, unknown>, candidates: string[]): number | undefined {
    for (const key of candidates) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private parseArguments(raw: unknown): Record<string, unknown> | undefined {
    if (!raw) {
      return undefined;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return undefined;
      }
    }
    if (typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }
    return undefined;
  }

  private async dispatchTool(call: ToolCall, repoPath: string, job: SandboxJob): Promise<unknown> {
    this.ensureNotCancelled(job);
    switch (call.name) {
      case 'run_shell':
        return this.handleRunShell(call.arguments, repoPath, job);
      case 'read_file':
        return this.handleReadFile(call.arguments, repoPath);
      case 'write_file':
        return this.handleWriteFile(call.arguments, repoPath, job);
      case 'http_get':
      case 'WebSearch':
        return this.handleHttpGet(call, job);
      case 'db_query':
        return this.handleDbQuery(call.arguments, job);
      default:
        return { error: `Ferramenta desconhecida: ${call.name}` };
    }
  }

  private normalizeDatabaseConfig(config?: SandboxDatabaseConfig): SandboxDatabaseConfig | undefined {
    if (!config) {
      return undefined;
    }

    const host = typeof config.host === 'string' ? config.host.trim() : '';
    const database = typeof config.database === 'string' ? config.database.trim() : '';
    const user = typeof config.user === 'string' ? config.user.trim() : '';
    const password = typeof config.password === 'string' ? config.password : undefined;
    const port = Number.isFinite(config.port) && config.port ? Math.floor(config.port) : undefined;

    if (!host || !database || !user) {
      return undefined;
    }

    return { host, database, user, password, port } satisfies SandboxDatabaseConfig;
  }

  private loadDatabaseConfig(): SandboxDatabaseConfig | undefined {
    const rawUrl = process.env.DB_URL ?? process.env.DATABASE_URL;
    const user = process.env.DB_USER?.trim();
    const password = process.env.DB_PASS;

    if (!rawUrl || !user || password === undefined) {
      return undefined;
    }

    const sanitizedUrl = rawUrl.startsWith('jdbc:') ? rawUrl.replace(/^jdbc:/, '') : rawUrl;
    let parsed: URL;
    try {
      parsed = new URL(sanitizedUrl);
    } catch (err) {
      console.warn(`Sandbox orchestrator: DB_URL inválida (${err instanceof Error ? err.message : String(err)})`);
      return undefined;
    }

    if (!['mysql:', 'mariadb:'].includes(parsed.protocol)) {
      console.warn(`Sandbox orchestrator: protocolo de banco não suportado: ${parsed.protocol}`);
      return undefined;
    }

    const database = parsed.pathname.replace(/^\//, '').trim();
    if (!database) {
      console.warn('Sandbox orchestrator: DB_URL não contém nome do database');
      return undefined;
    }

    const port = Number(parsed.port) || 3306;
    return this.normalizeDatabaseConfig({
      host: parsed.hostname,
      port: Number.isFinite(port) && port > 0 ? port : 3306,
      user,
      password,
      database,
    });
  }

  private resolveDatabaseConfig(job: SandboxJob): SandboxDatabaseConfig {
    const fromJob = this.normalizeDatabaseConfig(job.database);
    if (fromJob) {
      return fromJob;
    }

    const fromEnv = this.normalizeDatabaseConfig(this.dbConfigFromEnv);
    if (fromEnv) {
      return fromEnv;
    }

    throw new Error('Banco de dados não configurado para este job: configure as credenciais do ambiente solicitado.');
  }

  private getDbPool(job: SandboxJob): Pool {
    const existing = this.dbPools.get(job.jobId);
    if (existing) {
      return existing;
    }

    const config = this.resolveDatabaseConfig(job);
    const pool = mysql.createPool({
      host: config.host,
      port: Number.isFinite(config.port) && config.port ? config.port : 3306,
      user: config.user,
      password: config.password ?? undefined,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 4,
      queueLimit: 0,
    });

    this.dbPools.set(job.jobId, pool);
    return pool;
  }

  private async disposeDbPool(jobId: string): Promise<void> {
    const pool = this.dbPools.get(jobId);
    if (!pool) {
      return;
    }
    this.dbPools.delete(jobId);
    try {
      await pool.end();
    } catch {
      // ignore cleanup errors
    }
  }

  private sanitizeHeaders(raw: unknown): Record<string, string> | undefined {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return undefined;
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value !== 'string') {
        continue;
      }
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === 'authorization') {
        continue;
      }
      headers[normalizedKey] = value;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private validateExternalUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('URL inválida');
    }

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Apenas URLs http(s) são permitidas');
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
      throw new Error('Acesso a hosts locais não é permitido');
    }

    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4 || ipVersion === 6) {
      if (this.isPrivateIp(hostname, ipVersion)) {
        throw new Error('Acesso a endereços privados foi bloqueado');
      }
    }

    return parsed;
  }

  private isPrivateIp(host: string, version: 4 | 6): boolean {
    if (version === 6) {
      return host === '::1' || host.startsWith('fd') || host.startsWith('fc');
    }

    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
      return true;
    }

    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }

  private async handleDbQuery(args: Record<string, unknown>, job: SandboxJob) {
    job.dbQueryCount = (job.dbQueryCount ?? 0) + 1;

    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) {
      throw new Error('query é obrigatória para db_query');
    }
    if (!/^(select|with)\b/i.test(query)) {
      throw new Error('apenas consultas SELECT (incluindo CTEs com WITH) são permitidas em db_query');
    }

    const limitRaw = typeof args.limit === 'number' ? args.limit : Number(args.limit);
    const normalizedLimit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(Number(limitRaw)) : this.dbMaxRows;
    const maxRows = Math.min(normalizedLimit, this.dbMaxRows);

    const pool = this.getDbPool(job);
    this.log(job, `db_query: executando consulta com limite de ${maxRows} linhas (timeoutMs=${this.dbQueryTimeoutMs})`);
    const started = Date.now();
    let rows: any[] = [];

    try {
      const [result] = await pool.query({ sql: query, rowsAsArray: false, timeout: this.dbQueryTimeoutMs });
      rows = Array.isArray(result) ? result : [];
    } catch (err) {
      if (this.isTimeoutError(err)) {
        job.timeoutCount = (job.timeoutCount ?? 0) + 1;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`falha ao executar consulta SQL: ${message}`);
    }

    const truncated = rows.length > maxRows;
    const limitedRows = rows.slice(0, maxRows);
    const columns = limitedRows.length > 0 && typeof limitedRows[0] === 'object' && limitedRows[0] !== null
      ? Object.keys(limitedRows[0] as Record<string, unknown>)
      : [];

    return {
      rowCount: limitedRows.length,
      truncated,
      maxRows,
      columns,
      rows: limitedRows,
      elapsedMs: Date.now() - started,
    };
  }

  private async handleHttpGet(call: ToolCall, job: SandboxJob) {
    if (!this.fetchImpl) {
      throw new Error('fetch indisponível para http_get');
    }

    job.httpGetCount = (job.httpGetCount ?? 0) + 1;

    const args = call?.arguments ?? {};
    const urlArg = typeof args.url === 'string' ? args.url : undefined;
    if (!urlArg) {
      throw new Error('url é obrigatório para http_get');
    }

    const toolName = call?.name ?? 'http_get';
    const callId = call?.id;
    const url = this.validateExternalUrl(urlArg);
    const headers = this.sanitizeHeaders((args as Record<string, unknown>).headers);
    const maxResponseChars = this.resolveHttpToolMaxResponseChars(job);
    const requestedAt = new Date().toISOString();

    this.log(job, `${toolName}: ${url.toString()} (timeoutMs=${this.httpToolTimeoutMs}, maxResponseChars=${maxResponseChars})`);

    const controller = AbortSignal.timeout(this.httpToolTimeoutMs);
    let response: any;
    try {
      response = await this.fetchImpl(url.toString(), { method: 'GET', headers, signal: controller });
    } catch (err) {
      if (this.isTimeoutError(err)) {
        job.timeoutCount = (job.timeoutCount ?? 0) + 1;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`falha ao buscar URL: ${message}`);
    }

    const headersObject: Record<string, string> = {};
    try {
      for (const [key, value] of response.headers?.entries?.() ?? []) {
        headersObject[key] = value;
      }
    } catch {
      // noop - headers optional
    }

    let body = '';
    let truncated = false;
    try {
      const text = await response.text();
      const truncation = this.truncateStringValue(text, maxResponseChars);
      body = truncation.value;
      truncated = truncation.truncated;
      if (truncation.truncated) {
        this.log(job, `${toolName}: corpo truncado (omitiu ${truncation.omitted} caracteres)`);
      }
    } catch (err) {
      if (this.isTimeoutError(err)) {
        job.timeoutCount = (job.timeoutCount ?? 0) + 1;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`falha ao ler corpo da resposta: ${message}`);
    }

    const status = typeof response?.status === 'number' ? response.status : undefined;
    const success = this.isSuccessfulHttpResponse(response);
    if (success) {
      job.httpGetSuccessCount = (job.httpGetSuccessCount ?? 0) + 1;
    }

    this.recordHttpRequest(job, {
      callId,
      url: url.toString(),
      status,
      success,
      toolName,
      requestedAt,
    });

    return {
      url: url.toString(),
      status,
      statusText: response.statusText,
      headers: headersObject,
      body,
      truncated,
    };
  }

  private recordHttpRequest(job: SandboxJob, entry: SandboxHttpRequestLog) {
    job.httpRequests = Array.isArray(job.httpRequests) ? job.httpRequests : [];
    job.httpRequests.push(entry);
  }

  private isSuccessfulHttpResponse(response: any): boolean {
    if (response?.ok === true) {
      return true;
    }
    if (response?.ok === false) {
      return false;
    }
    const status = typeof response?.status === 'number' ? response.status : undefined;
    if (status === undefined) {
      return false;
    }
    return status >= 200 && status < 300;
  }

  private isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const name = (error.name ?? '').toLowerCase();
    const message = (error.message ?? '').toLowerCase();
    return name.includes('abort') || name.includes('timeout') || message.includes('aborted') || message.includes('timeout');
  }

  private getMaxBufferBytes(): number {
    const maxBufferEnv = Number(process.env.RUN_SHELL_MAX_BUFFER_BYTES);
    return Number.isFinite(maxBufferEnv) && maxBufferEnv > 0 ? maxBufferEnv : 5 * 1024 * 1024;
  }

  private appendWithLimit(current: string, chunk: string, max: number): { value: string; truncated: boolean } {
    if (current.length >= max) {
      return { value: current, truncated: true };
    }
    const remaining = max - current.length;
    if (chunk.length <= remaining) {
      return { value: current + chunk, truncated: false };
    }
    return { value: current + chunk.slice(0, remaining), truncated: true };
  }

  private shouldForceCiEnv(command: string[]): boolean {
    if (this.isTestCommand(command)) {
      return true;
    }
    const shellSubcommands = this.extractShellSubcommands(command);
    return shellSubcommands.some((subcommand) => this.isTestCommand(subcommand));
  }

  private isTestCommand(command: string[]): boolean {
    const normalized = this.stripEnvAssignments(command);
    if (normalized.length === 0) {
      return false;
    }
    const commandName = path.basename(normalized[0]);
    const args = normalized.slice(1);
    const testRunners = new Set(['vitest', 'jest', 'playwright']);
    const packageManagers = new Set(['npm', 'pnpm', 'yarn', 'bun']);
    const dlxCommands = new Set(['npx', 'pnpm', 'yarn', 'bunx']);
    const isTestToken = (token: string) => token === 'test' || token.startsWith('test:') || testRunners.has(token);

    if (testRunners.has(commandName)) {
      return true;
    }

    if (dlxCommands.has(commandName) && args.length > 0 && testRunners.has(args[0])) {
      return true;
    }

    if (!packageManagers.has(commandName)) {
      return false;
    }

    if (commandName === 'npm') {
      const scriptName = args[0] === 'run' ? args[1] : args[0];
      return typeof scriptName === 'string' && isTestToken(scriptName);
    }

    if (commandName === 'pnpm' || commandName === 'yarn' || commandName === 'bun') {
      const first = args[0];
      const scriptName = first === 'run' ? args[1] : first;
      return typeof scriptName === 'string' && isTestToken(scriptName);
    }

    return false;
  }

  private stripEnvAssignments(tokens: string[]): string[] {
    const normalized = [...tokens];
    while (normalized.length > 0 && this.isEnvAssignment(normalized[0])) {
      normalized.shift();
    }
    return normalized;
  }

  private isEnvAssignment(token: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(token);
  }

  private extractShellSubcommands(command: string[]): string[][] {
    if (command.length === 0) {
      return [];
    }
    const shellNames = new Set(['sh', 'bash', 'zsh', 'ksh', 'dash', 'ash', 'fish']);
    const commandName = path.basename(command[0]);
    if (!shellNames.has(commandName)) {
      return [];
    }

    const args = command.slice(1);
    const scriptCandidates: string[] = [];
    for (let i = 0; i < args.length; i += 1) {
      const arg = args[i];
      if (typeof arg !== 'string') {
        continue;
      }
      if (this.isShellExecuteFlag(arg)) {
        const script = args[i + 1];
        if (typeof script === 'string' && script.trim().length > 0) {
          scriptCandidates.push(script);
        }
        i += 1;
      }
    }

    if (scriptCandidates.length === 0 && args.length > 0) {
      const fallback = args[args.length - 1];
      if (typeof fallback === 'string' && fallback.trim().length > 0) {
        scriptCandidates.push(fallback);
      }
    }

    return scriptCandidates.flatMap((candidate) => this.tokenizeShellCommand(candidate));
  }

  private isShellExecuteFlag(arg: string): boolean {
    if (arg === '-c' || arg === '--command') {
      return true;
    }
    return /^-[^-]*c[^-]*$/.test(arg);
  }

  private tokenizeShellCommand(script: string): string[][] {
    return this.splitCompositeCommand(script)
      .map((segment) => this.tokenizeSegment(segment))
      .filter((tokens) => tokens.length > 0);
  }

  private splitCompositeCommand(script: string): string[] {
    return script
      .split(/&&|\|\||;|\n/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);
  }

  private tokenizeSegment(segment: string): string[] {
    const matches = segment.match(/(?:[^\s"'`]+|"[^"]*"|'[^']*'|`[^`]*`)+/g);
    if (!matches) {
      return [];
    }
    return matches.map((token) => this.stripQuotes(token));
  }

  private stripQuotes(token: string): string {
    if (token.length >= 2) {
      const first = token[0];
      const last = token[token.length - 1];
      if (
        (first === '"' && last === '"') ||
        (first === '\'' && last === '\'') ||
        (first === '`' && last === '`')
      ) {
        return token.slice(1, -1);
      }
    }
    return token;
  }

  private resolvePath(repoPath: string, requested: string | undefined, job?: SandboxJob): string {
    if (!requested) {
      throw new Error('path ausente');
    }
    const sanitized = this.sanitizeRequestedPath(requested);
    if (!sanitized) {
      throw new Error('path ausente');
    }
    if (sanitized !== requested && job) {
      this.log(job, `normalizando caminho solicitado de "${requested}" para "${sanitized}"`);
    }
    const absolute = path.resolve(repoPath, sanitized);
    if (!absolute.startsWith(repoPath)) {
      throw new Error('Acesso a caminho fora do sandbox bloqueado');
    }
    return absolute;
  }

  private normalizeRepoPath(
    repoPath: string,
    requested: string | undefined,
  ): { absolute: string; relative: string } {
    const absolute = this.resolvePath(repoPath, requested);
    const relative = path.relative(repoPath, absolute) || path.basename(absolute);
    return { absolute, relative };
  }

  private async handleRunShell(args: Record<string, unknown>, repoPath: string, job: SandboxJob) {
    let command = Array.isArray(args.command) ? (args.command as string[]) : undefined;
    if (!command || command.length === 0) {
      throw new Error('command é obrigatório para run_shell');
    }
    const cwdArg = typeof args.cwd === 'string' ? args.cwd : undefined;
    const cwd = cwdArg ? this.resolvePath(repoPath, cwdArg, job) : repoPath;
    await this.assertDirectoryExists(cwd);

    command = command.map((part) => part.trim());
    const isRecursiveGrep = command[0] === 'grep' && command[1] === '-R';
    if (isRecursiveGrep && command.length <= 2) {
      const message = 'grep -R detectado. Use rg <padrao> <caminho> para buscas recursivas no sandbox.';
      this.log(job, message);
      throw new Error(message);
    }

    if (isRecursiveGrep) {
      const rgCommand = ['rg', ...command.slice(2)];
      this.log(
        job,
        `comando grep -R detectado; substituindo por rg para busca recursiva: ${command.join(' ')} -> ${rgCommand.join(
          ' ',
        )}`,
      );
      command = rgCommand;
    }

    const joined = command.join(' ');
    const timeoutEnv = Number(process.env.RUN_SHELL_TIMEOUT_MS);
    const defaultTimeoutMs = Number.isFinite(timeoutEnv) && timeoutEnv > 0 ? timeoutEnv : 300_000;
    const isMavenCommand = path.basename(command[0]) === 'mvn';
    const mavenTimeoutMs = 15 * 60 * 1000;
    const timeoutMs = isMavenCommand ? Math.max(defaultTimeoutMs, mavenTimeoutMs) : defaultTimeoutMs;
    if (isMavenCommand && timeoutMs > defaultTimeoutMs) {
      this.log(job, 'mvn detectado; aumentando timeout para 15 minutos');
    }
    const maxBuffer = this.getMaxBufferBytes();

    this.log(
      job,
      `run_shell: ${joined} (cwd=${cwd}, timeoutMs=${timeoutMs}, maxBufferBytes=${maxBuffer})`,
    );

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;

    const forceCi = this.shouldForceCiEnv(command);
    const env = forceCi ? { ...process.env, CI: '1', NODE_ENV: 'test' } : process.env;
    if (forceCi) {
      this.log(job, `run_shell: CI=1 aplicado para evitar modo watch`);
      this.log(job, `run_shell: NODE_ENV=test aplicado para evitar React em modo produção durante testes`);
    }

    const child = spawn(command[0], command.slice(1), { cwd, env });

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const result = this.appendWithLimit(stdout, chunk, maxBuffer);
      stdout = result.value;
      stdoutTruncated = stdoutTruncated || result.truncated;
      this.log(job, `run_shell stdout: ${this.truncate(chunk, 500)}`);
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const result = this.appendWithLimit(stderr, chunk, maxBuffer);
      stderr = result.value;
      stderrTruncated = stderrTruncated || result.truncated;
      this.log(job, `run_shell stderr: ${this.truncate(chunk, 500)}`);
    });

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      this.log(job, `run_shell atingiu timeout de ${timeoutMs}ms; finalizando processo`);
      child.kill('SIGKILL');
    }, timeoutMs);

    const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.on('error', (err) => {
        clearTimeout(timeoutHandle);
        reject(err);
      });
      child.on('close', (code, signal) => {
        clearTimeout(timeoutHandle);
        resolve({ code, signal });
      });
    });

    if (stdoutTruncated || stderrTruncated) {
      this.log(job, 'run_shell output truncado para respeitar maxBuffer');
    }
    this.log(
      job,
      `run_shell finalizado (code=${exitResult.code}, signal=${exitResult.signal}, timedOut=${timedOut})`,
    );
    if (timedOut) {
      job.timeoutCount = (job.timeoutCount ?? 0) + 1;
    }

    return {
      stdout,
      stderr,
      exitCode: exitResult.code,
      signal: exitResult.signal,
      timedOut,
      stdoutTruncated,
      stderrTruncated,
    };
  }

  private async runGitCommand(
    command: string,
    repoPath: string,
    job?: SandboxJob,
    allowedExitCodes: number[] = [0],
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
  }> {
    const maxBuffer = this.getMaxBufferBytes();
    if (job) {
      this.log(job, `git comando: ${command} (cwd=${repoPath}, maxBufferBytes=${maxBuffer})`);
    }

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let stdoutTruncationLogged = false;
    let stderrTruncationLogged = false;

    const { shell, args } = this.getShellCommand(command);
    const child = spawn(shell, args, { cwd: repoPath });

    const logIfTruncated = (stream: 'stdout' | 'stderr', truncated: boolean) => {
      if (!truncated) {
        return;
      }
      if (stream === 'stdout' && stdoutTruncationLogged) {
        return;
      }
      if (stream === 'stderr' && stderrTruncationLogged) {
        return;
      }
      const message = `git ${stream} truncado após atingir maxBufferBytes=${maxBuffer} para comando: ${command}`;
      if (job) {
        this.log(job, message);
      } else {
        console.warn(message);
      }
      if (stream === 'stdout') {
        stdoutTruncationLogged = true;
      } else {
        stderrTruncationLogged = true;
      }
    };

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const result = this.appendWithLimit(stdout, chunk, maxBuffer);
      stdout = result.value;
      const wasTruncated = stdoutTruncated || result.truncated;
      if (!stdoutTruncated && wasTruncated) {
        logIfTruncated('stdout', true);
      }
      stdoutTruncated = wasTruncated;
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString();
      const result = this.appendWithLimit(stderr, chunk, maxBuffer);
      stderr = result.value;
      const wasTruncated = stderrTruncated || result.truncated;
      if (!stderrTruncated && wasTruncated) {
        logIfTruncated('stderr', true);
      }
      stderrTruncated = wasTruncated;
    });

    const exitResult = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.on('error', (err) => reject(err));
      child.on('close', (code, signal) => resolve({ code, signal }));
    });

    if (stdoutTruncated || stderrTruncated) {
      logIfTruncated('stdout', stdoutTruncated);
      logIfTruncated('stderr', stderrTruncated);
    }

    if (exitResult.code !== null && !allowedExitCodes.includes(exitResult.code)) {
      const error = new Error(
        `git comando falhou (exitCode=${exitResult.code}, signal=${exitResult.signal}): ${command}`,
      ) as NodeJS.ErrnoException & {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        signal?: NodeJS.Signals | null;
      };
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = exitResult.code === null ? undefined : exitResult.code.toString();
      error.exitCode = exitResult.code ?? undefined;
      error.signal = exitResult.signal;
      throw error;
    }

    return { stdout, stderr, exitCode: exitResult.code, stdoutTruncated, stderrTruncated };
  }

  private getShellCommand(command: string): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      const shell = process.env.COMSPEC || 'cmd.exe';
      return { shell, args: ['/d', '/s', '/c', command] };
    }

    const shell = process.env.SHELL || '/bin/sh';
    return { shell, args: ['-c', command] };
  }

  private async handleReadFile(args: Record<string, unknown>, repoPath: string) {
    const { absolute, relative } = this.normalizeRepoPath(
      repoPath,
      typeof args.path === 'string' ? args.path : undefined,
    );
    const content = await fs.readFile(absolute, 'utf8');
    return { path: relative, content };
  }

  private async handleWriteFile(args: Record<string, unknown>, repoPath: string, job: SandboxJob) {
    const { absolute, relative } = this.normalizeRepoPath(
      repoPath,
      typeof args.path === 'string' ? args.path : undefined,
    );
    const content = typeof args.content === 'string' ? args.content : '';
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf8');
    this.log(job, `write_file: ${absolute}`);
    this.resetEcoTwoLoopAttempts(job, 'write_file executada');
    return { status: 'ok', path: relative, content };
  }

  private async listUntrackedFiles(repoPath: string, job?: SandboxJob): Promise<string[]> {
    const statusLines = await this.getStatusLines(repoPath, job);
    return statusLines
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3).trim())
      .filter((line) => line.length > 0);
  }

  private async getStatusLines(repoPath: string, job?: SandboxJob): Promise<string[]> {
    const { stdout } = await this.runGitCommand('git status --porcelain=v1 --untracked-files=all', repoPath, job);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private uniquePaths(paths: string[]): string[] {
    return Array.from(new Set(paths));
  }

  private async collectChangedFiles(repoPath: string, baseCommit?: string, job?: SandboxJob): Promise<string[]> {
    if (!(await this.isGitRepository(repoPath))) {
      return [];
    }
    const { stdout } = await this.runGitCommand(`git diff --name-only ${baseCommit ?? 'HEAD'}`, repoPath, job);
    const tracked = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const untracked = await this.listUntrackedFiles(repoPath, job);
    return this.uniquePaths([...tracked, ...untracked]);
  }

  private async generatePatch(repoPath: string, baseCommit?: string, job?: SandboxJob): Promise<string> {
    if (!(await this.isGitRepository(repoPath))) {
      return '';
    }
    const { stdout: trackedDiff } = await this.runGitCommand(`git diff ${baseCommit ?? 'HEAD'}`, repoPath, job);
    const untracked = await this.listUntrackedFiles(repoPath, job);

    const untrackedDiffs: string[] = [];
    for (const file of untracked) {
      const escaped = this.escapePathForShell(file);
      try {
        const { stdout } = await this.runGitCommand(
          `git diff --no-index --binary -- /dev/null ${escaped}`,
          repoPath,
          job,
          [0, 1],
        );
        if (stdout.trim().length > 0) {
          untrackedDiffs.push(stdout);
        }
      } catch (err: any) {
        if (err?.code === 1 && typeof err.stdout === 'string' && err.stdout.trim().length > 0) {
          // git diff --no-index retorna exit code 1 quando diferenças são encontradas
          untrackedDiffs.push(err.stdout);
        } else {
          throw err;
        }
      }
    }

    return [trackedDiff, ...untrackedDiffs].filter((chunk) => chunk.trim().length > 0).join('\n');
  }

  private async isGitRepository(repoPath: string): Promise<boolean> {
    try {
      await fs.stat(path.join(repoPath, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  private resolveRepoSlug(job: SandboxJob): string | undefined {
    if (job.repoSlug) {
      return job.repoSlug;
    }

    try {
      const parsed = new URL(job.repoUrl);
      if (parsed.hostname.toLowerCase() !== 'github.com') {
        return undefined;
      }
      const parts = parsed.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private async getHeadCommit(repoPath: string): Promise<string | undefined> {
    if (!(await this.isGitRepository(repoPath))) {
      return undefined;
    }
    try {
      const { stdout } = await exec('git rev-parse HEAD', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return undefined;
    }
  }

  private async maybeCreatePullRequest(
    job: SandboxJob,
    repoPath: string,
    githubAuth: { token?: string; username: string; source: string },
    baseCommit?: string,
    diffPatch?: string,
  ): Promise<void> {
    this.ensureNotCancelled(job);
    const token = githubAuth.token;
    if (!token) {
      this.log(job, 'nenhum token GitHub disponível; ignorando criação de PR');
      return;
    }

    const repoSlug = this.resolveRepoSlug(job);
    if (!repoSlug) {
      this.log(job, 'repoSlug ausente e repoUrl não é github.com; não é possível criar PR');
      return;
    }

    if (!this.fetchImpl) {
      this.log(job, 'fetch API indisponível; não é possível criar PR');
      return;
    }

    if (!(await this.isGitRepository(repoPath))) {
      this.log(job, 'repositório git ausente, não é possível criar PR');
      return;
    }

    const diff = diffPatch ?? (await this.generatePatch(repoPath, baseCommit, job));
    if (!diff.trim()) {
      this.log(job, 'nenhuma alteração detectada; PR não será criado');
      return;
    }

    const branchName = `ai-hub/cifix-${job.jobId}`;
    try {
      await exec('git config user.email "ai-hub-bot@example.com"', { cwd: repoPath });
      await exec('git config user.name "AI Hub Bot"', { cwd: repoPath });
      await exec(`git checkout -B ${branchName}`, { cwd: repoPath });
      await exec('git add -A', { cwd: repoPath });
      await exec('git commit -m "Correção automática do AI Hub"', { cwd: repoPath });

      const authenticatedRemote = buildAuthRepoUrl(
        job.repoUrl,
        token,
        githubAuth.username,
      );
      await exec(`git remote set-url origin ${authenticatedRemote}`, { cwd: repoPath });
      try {
        await exec(`git push origin ${branchName}`, { cwd: repoPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const hint = this.permissionHintFromMessage(message);
        throw new Error(
          `Falha ao fazer push para criar PR: ${message}${hint ? ` (${hint})` : ''}`,
        );
      }

      const prTitle = this.buildPrTitle(job.summary);
      const prBody = this.buildPrBody(job.summary, job.taskDescription);
      const pr = await this.createPullRequestWithRetry(
        job,
        repoSlug,
        token,
        branchName,
        job.branch,
        prTitle,
        prBody,
      );
      if (pr?.html_url) {
        job.pullRequestUrl = pr.html_url;
        this.log(job, `pull request criado em ${job.pullRequestUrl}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(job, `falha ao criar pull request: ${message}`);
    }
  }


  private async createPullRequestWithRetry(
    job: SandboxJob,
    repoSlug: string,
    token: string,
    head: string,
    baseBranch: string,
    title: string,
    body: string,
  ): Promise<any> {
    if (!this.fetchImpl) {
      throw new Error('fetch API indisponível; não é possível criar PR');
    }
    const maxAttempts = Math.max(1, this.prCreateMaxAttempts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(`${this.githubApiBase}/repos/${repoSlug}/pulls`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json',
          },
          body: JSON.stringify({ title, head, base: baseBranch, body }),
        });

        if (!response.ok) {
          const rawBody = (await response.text().catch(() => '')) ?? '';
          const normalized = rawBody.trim().length > 0 ? rawBody : 'erro desconhecido da API do GitHub';
          const message = this.truncate(normalized, 400);
          const permissionHint =
            response.status === 401 || response.status === 403
              ? 'token pode estar sem permissão de pull request ou push'
              : undefined;

          if (this.shouldRetryPullRequestStatus(response.status) && attempt < maxAttempts) {
            const delayMs = this.calculatePrRetryDelay(attempt);
            this.log(
              job,
              `tentativa ${attempt}/${maxAttempts} ao criar PR retornou status ${response.status}; ` +
                `nova tentativa em ${delayMs}ms (${message})`,
            );
            await this.sleep(delayMs);
            continue;
          }

          throw new Error(
            `Falha ao criar PR: ${response.status} ${message}${
              permissionHint ? ` (${permissionHint})` : ''
            }`,
          );
        }

        return await response.json();
      } catch (error) {
        if (this.isRetryableNetworkError(error) && attempt < maxAttempts) {
          const delayMs = this.calculatePrRetryDelay(attempt);
          this.log(
            job,
            `tentativa ${attempt}/${maxAttempts} falhou ao chamar API do GitHub (${this.formatError(error)}); ` +
              `aguardando ${delayMs}ms antes de tentar novamente`,
          );
          await this.sleep(delayMs);
          continue;
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error('Falha ao criar PR após múltiplas tentativas');
  }

  private shouldRetryPullRequestStatus(status: number): boolean {
    if (!Number.isFinite(status)) {
      return false;
    }
    if (status === 429 || status === 408) {
      return true;
    }
    return status >= 500 && status < 600;
  }

  private isRetryableNetworkError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    const code = typeof (error as any)?.code === 'string' ? (error as any).code.toUpperCase() : undefined;
    if (code && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED', 'ENOTFOUND'].includes(code)) {
      return true;
    }
    const message = (error.message ?? '').toLowerCase();
    return (
      message.includes('fetch failed') ||
      message.includes('networkerror') ||
      message.includes('timed out') ||
      message.includes('socket hang up') ||
      message.includes('tls handshake timeout')
    );
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const label = error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message ?? '';
      const fallback = label && label.trim().length > 0 ? label : error.toString();
      return this.truncate(fallback, 200);
    }
    return this.truncate(String(error), 200);
  }

  private calculatePrRetryDelay(attempt: number): number {
    const base = Math.max(0, this.prCreateRetryDelayMs);
    return base * Math.max(1, attempt);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private permissionHintFromMessage(message: string): string | undefined {
    const normalized = message.toLowerCase();
    if (normalized.includes('permission denied') || normalized.includes('authentication failed')) {
      return 'verifique se o token tem escopos de push e pull_request';
    }
    return undefined;
  }

  private buildCallbackPayload(job: SandboxJob): SandboxJob {
    const { callbackSecret: _secret, ...rest } = job;
    const payload = { ...rest } as SandboxJob;
    if (job.database) {
      const { password: _password, ...database } = job.database;
      payload.database = database;
    }
    return payload;
  }

  private async sendCallback(job: SandboxJob): Promise<void> {
    if (!job.callbackUrl) {
      return;
    }
    if (!this.fetchImpl) {
      this.log(job, 'callback configurado, mas fetch não está disponível no ambiente');
      return;
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (job.callbackSecret) {
      headers['X-Sandbox-Callback-Token'] = job.callbackSecret;
    }

    const payload = this.buildCallbackPayload(job);

    try {
      const response = await this.fetchImpl(job.callbackUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`status ${response.status}: ${this.truncate(bodyText, 400)}`);
      }
      this.log(job, `callback enviado para ${job.callbackUrl}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(job, `falha ao enviar callback para ${job.callbackUrl}: ${message}`);
    }
  }

  private log(job: SandboxJob, message: string) {
    const entry = `[${new Date().toISOString()}] ${message}`;
    job.logs.push(entry);
    console.info(`Sandbox job ${job.jobId}: ${message}`);
  }

  private async describePathStatus(target: string): Promise<string> {
    try {
      const stats = await fs.stat(target);
      if (stats.isDirectory()) {
        return 'diretório acessível';
      }
      return `existe mas não é diretório (mode=${stats.mode})`;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `inacessível: ${message}`;
    }
  }

  private sanitizeRequestedPath(requested: string | undefined): string | undefined {
    if (!requested) {
      return undefined;
    }
    const trimmed = requested.trim();
    const withoutQuotes = trimmed.replace(/^['"`]+|['"`]+$/g, '');
    const withoutTrailingBraces = withoutQuotes.replace(/[}\]]+$/g, '');
    const sanitized = withoutTrailingBraces.trim();
    return sanitized.length > 0 ? sanitized : undefined;
  }

  private async assertDirectoryExists(cwd: string): Promise<void> {
    try {
      const stats = await fs.stat(cwd);
      if (!stats.isDirectory()) {
        throw new Error(`cwd não é um diretório: ${cwd}`);
      }
    } catch (err) {
      throw new Error(`cwd não encontrado: ${cwd}`);
    }
  }

  private extractCallId(item: { id?: string; call_id?: string }, index: number): string {
    const fallback = `call_${index}`;
    const rawId = item.call_id ?? item.id ?? fallback;
    if (typeof rawId === 'string' && rawId.trim().length > 0) {
      return rawId;
    }
    return fallback;
  }

  private normalizeFunctionCallOutputId(rawId: string | undefined, fallback: string): string {
    const base = rawId && rawId.length > 0 ? rawId : fallback;
    const sanitized = this.sanitizeId(base.replace(/^fco_/, ''));
    return sanitized.startsWith('fco_') ? sanitized : `fco_${sanitized}`;
  }

  private sanitizeId(id: string | undefined): string {
    if (!id) {
      return 'msg_default';
    }
    const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return sanitized.length > 0 ? sanitized : 'msg_default';
  }

  private escapePathForShell(target: string): string {
    return `'${target.replace(/'/g, "'\''")}'`;
  }

  private buildPrTitle(summary?: string): string {
    const defaultTitle = 'Correção automática do AI Hub';
    const prefix = 'AI Hub: ';
    const maxLength = 256;

    if (!summary || summary.trim().length === 0) {
      return defaultTitle;
    }

    const availableForSummary = Math.max(1, maxLength - prefix.length);
    const truncatedSummary = this.truncateWithEllipsis(summary.trim(), availableForSummary);
    return `${prefix}${truncatedSummary}`;
  }

  private buildPrBody(summary: string | undefined, taskDescription: string): string {
    const sections = [
      'Correção automática gerada pelo sandbox do AI Hub.',
      taskDescription ? `\n**Descrição da tarefa:**\n${taskDescription}` : undefined,
      summary ? `\n**Resumo das alterações:**\n${summary}` : undefined,
    ].filter(Boolean);

    return sections.join('\n');
  }

  private truncateWithEllipsis(value: string, maxLength: number): string {
    if (!value || maxLength <= 0) {
      return '';
    }
    if (value.length <= maxLength) {
      return value;
    }
    if (maxLength === 1) {
      return value.slice(0, maxLength);
    }
    return `${value.slice(0, maxLength - 1)}…`;
  }

  private truncate(value: string, maxLength = 200): string {
    if (!value) {
      return '';
    }
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
  }

  private logJson(job: SandboxJob, prefix: string, payload: unknown, maxLength = 2000) {
    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch (err) {
      serialized = `erro ao serializar payload: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.log(job, `${prefix}: ${this.truncate(serialized, maxLength)}`);
  }

  private sanitizeTaskDescription(description: string, job: SandboxJob): string {
    const limit = this.resolveTaskDescriptionLimit(job);
    const sanitizedDescription = description ?? '';
    const { value, truncated, omitted } = this.truncateStringValue(sanitizedDescription, limit);
    if (truncated) {
      this.log(
        job,
        `taskDescription com ${sanitizedDescription.length} caracteres truncado para ${limit} para evitar erro de contexto (omitiu ${omitted} caracteres)`,
      );
    }
    return value;
  }

  private prepareToolOutput(result: unknown, job: SandboxJob): string {
    const stringLimit = this.resolveToolOutputStringLimit(job);
    const serializedLimit = this.resolveToolOutputSerializedLimit(job);
    const truncation = { truncated: false };
    const sanitized = this.truncateStringFields(result, stringLimit, truncation);
    let serialized: string;

    try {
      serialized = JSON.stringify(sanitized);
    } catch (err) {
      serialized = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
    }

    if (truncation.truncated) {
      this.log(
        job,
        `output de tool truncado para ${stringLimit} caracteres por campo para evitar ultrapassar a janela de contexto`,
      );
    }

    const { value, truncated, omitted } = this.truncateStringValue(serialized, serializedLimit);
    if (truncated) {
      this.log(
        job,
        `output serializado da tool excedeu ${serializedLimit} caracteres e foi truncado (omitiu ${omitted} caracteres)`
      );
    }
    return value;
  }

  private resolveModel(job: SandboxJob): string {
    const candidate = typeof job.model === 'string' ? job.model.trim() : '';
    if (candidate) {
      return candidate;
    }
    if ((this.isEconomy(job) || this.isSmartEconomy(job) || this.isEcoOne(job) || this.isEcoTwo(job) || this.isEcoThree(job) || this.isChatgptCodex(job)) && this.economyModel) {
      return this.economyModel;
    }
    return this.model;
  }

  private isEconomy(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'ECONOMY';
  }

  private isEcoOne(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'ECO_1';
  }

  private isEcoTwo(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'ECO_2';
  }

  private isEcoThree(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'ECO_3';
  }

  private isSmartEconomy(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'SMART_ECONOMY';
  }

  private isChatgptCodex(job: SandboxJob): boolean {
    return (job.profile ?? 'STANDARD') === 'CHATGPT_CODEX';
  }

  private resolveTaskDescriptionLimit(job: SandboxJob): number {
    if (this.isEconomy(job)) {
      return this.economyMaxTaskDescriptionChars;
    }
    if (this.isSmartEconomy(job)) {
      return this.smartEconomyMaxTaskDescriptionChars;
    }
    if (this.isEcoOne(job)) {
      return this.ecoOneMaxTaskDescriptionChars;
    }
    if (this.isChatgptCodex(job)) {
      return this.chatgptCodexMaxTaskDescriptionChars;
    }
    return this.maxTaskDescriptionChars;
  }

  private resolveToolOutputStringLimit(job: SandboxJob): number {
    if (this.isEconomy(job)) {
      return this.economyToolOutputStringLimit;
    }
    if (this.isSmartEconomy(job)) {
      return this.smartEconomyToolOutputStringLimit;
    }
    if (this.isEcoTwo(job)) {
      return this.ecoTwoToolOutputStringLimit;
    }
    if (this.isEcoThree(job)) {
      return this.ecoThreeToolOutputStringLimit;
    }
    if (this.isEcoOne(job)) {
      return this.ecoOneToolOutputStringLimit;
    }
    if (this.isChatgptCodex(job)) {
      return this.chatgptCodexToolOutputStringLimit;
    }
    return this.toolOutputStringLimit;
  }

  private resolveToolOutputSerializedLimit(job: SandboxJob): number {
    if (this.isEconomy(job)) {
      return this.economyToolOutputSerializedLimit;
    }
    if (this.isSmartEconomy(job)) {
      return this.smartEconomyToolOutputSerializedLimit;
    }
    if (this.isEcoTwo(job)) {
      return this.ecoTwoToolOutputSerializedLimit;
    }
    if (this.isEcoThree(job)) {
      return this.ecoThreeToolOutputSerializedLimit;
    }
    if (this.isEcoOne(job)) {
      return this.ecoOneToolOutputSerializedLimit;
    }
    if (this.isChatgptCodex(job)) {
      return this.chatgptCodexToolOutputSerializedLimit;
    }
    return this.toolOutputSerializedLimit;
  }

  private resolveHttpToolMaxResponseChars(job: SandboxJob): number {
    if (this.isEconomy(job)) {
      return this.economyHttpToolMaxResponseChars;
    }
    if (this.isSmartEconomy(job)) {
      return this.smartEconomyHttpToolMaxResponseChars;
    }
    if (this.isEcoTwo(job)) {
      return this.ecoTwoHttpToolMaxResponseChars;
    }
    if (this.isEcoThree(job)) {
      return this.ecoThreeHttpToolMaxResponseChars;
    }
    if (this.isEcoOne(job)) {
      return this.ecoOneHttpToolMaxResponseChars;
    }
    if (this.isChatgptCodex(job)) {
      return this.chatgptCodexHttpToolMaxResponseChars;
    }
    return this.httpToolMaxResponseChars;
  }

  private applyEcoPreSamplingCompaction(job: SandboxJob, messages: ResponseItem[]): void {
    const profile = this.resolveEcoProfile(job);
    if (!profile) {
      return;
    }
    const trimmedHistory = this.pruneEcoHistory(job, messages, profile.historyTargetTokens, profile.label);
    const trimmedUsers = this.enforceEcoUserMessageBudget(
      job,
      messages,
      profile.userMessageTokenLimit,
      profile.label,
    );
    if (trimmedHistory || trimmedUsers) {
      this.log(
        job,
        `Modo ${profile.label}: histórico compactado preventivamente antes da próxima iteração.`,
      );
    }
  }

  private enforceEcoUserMessageBudget(
    job: SandboxJob,
    messages: ResponseItem[],
    limit: number,
    label: string,
  ): boolean {
    if (!Array.isArray(messages) || messages.length === 0) {
      return false;
    }
    const normalizedLimit = Math.max(0, limit);
    let remaining = normalizedLimit;
    let preservedUserMessages = 0;
    let changed = false;

    for (let index = messages.length - 1; index >= 0; index--) {
      const item = messages[index];
      if (!item || item.type !== 'message') {
        continue;
      }
      const message = item as ResponseOutputMessage;
      const role = (message as { role?: string }).role ?? 'assistant';
      if (role !== 'user') {
        continue;
      }

      const textValue = this.collectMessageTexts(message.content);
      const tokens = this.approximateTokensFromText(textValue);
      if (tokens <= remaining) {
        remaining = Math.max(0, remaining - tokens);
        preservedUserMessages++;
        continue;
      }

      if (remaining > 0) {
        const truncated = this.truncateTextByTokenBudget(textValue, remaining);
        const note = `\n\n[Modo ${label}: ${truncated.omittedTokens} tokens omitidos do histórico do usuário]`;
        message.content = [{ type: 'output_text', text: `${truncated.value}${note}` }] as ResponseOutputMessage['content'];
        remaining = 0;
        preservedUserMessages++;
        changed = true;
        this.log(job, `Modo ${label}: mensagem de usuário truncada para manter o limite configurado.`);
        continue;
      }

      if (preservedUserMessages === 0 && normalizedLimit > 0) {
        const fallbackTokens = Math.max(1, Math.floor(normalizedLimit * 0.1));
        const truncated = this.truncateTextByTokenBudget(textValue, fallbackTokens);
        const note = `\n\n[Modo ${label}: ${truncated.omittedTokens} tokens omitidos para preservar contexto do usuário]`;
        message.content = [{ type: 'output_text', text: `${truncated.value}${note}` }] as ResponseOutputMessage['content'];
        preservedUserMessages++;
        changed = true;
        this.log(job, `Modo ${label}: mensagem de usuário preservada com resumo mínimo.`);
      } else {
        messages.splice(index, 1);
        changed = true;
        this.log(job, `Modo ${label}: mensagem de usuário antiga removida para respeitar o limite do histórico.`);
      }
    }

    return changed;
  }

  private enforceEcoAutoCompaction(job: SandboxJob, messages: ResponseItem[]): void {
    const profile = this.resolveEcoProfile(job);
    if (!profile) {
      return;
    }
    const totalTokens = job.totalTokens ?? 0;
    if (totalTokens <= 0) {
      return;
    }
    const autoCompactLimit = Math.max(0, profile.autoCompactTokenLimit);
    if (autoCompactLimit === 0 || totalTokens < autoCompactLimit) {
      return;
    }
    const target = Math.min(profile.historyTargetTokens, Math.floor(autoCompactLimit * 0.9));
    if (target <= 0) {
      return;
    }
    if (this.pruneEcoHistory(job, messages, target, profile.label)) {
      this.log(
        job,
        `Modo ${profile.label}: auto-compactação executada após atingir ${totalTokens} tokens (alvo ${target}).`,
      );
    }
  }

  private pruneEcoHistory(
    job: SandboxJob,
    messages: ResponseItem[],
    targetTokens: number,
    label: string,
  ): boolean {
    if (!Array.isArray(messages) || messages.length === 0 || !Number.isFinite(targetTokens) || targetTokens <= 0) {
      return false;
    }
    let estimated = this.estimateMessagesTokenFootprint(messages);
    if (estimated <= targetTokens) {
      return false;
    }
    let removed = 0;

    for (let index = messages.length - 1; index >= 0 && estimated > targetTokens; index--) {
      const item = messages[index];
      if (!this.isEcoRemovableHistoryItem(item)) {
        break;
      }
      const footprint = this.estimateItemTokenFootprint(item);
      messages.splice(index, 1);
      estimated = Math.max(0, estimated - footprint);
      removed++;
    }

    if (removed > 0) {
      this.log(job, `Modo ${label}: removidos ${removed} item(ns) do histórico para manter ${targetTokens} tokens.`);
      return true;
    }
    return false;
  }

  private resolveEcoProfile(job: SandboxJob): {
    label: string;
    autoCompactTokenLimit: number;
    historyTargetTokens: number;
    userMessageTokenLimit: number;
  } | undefined {
    if (this.isEcoTwo(job)) {
      return {
        label: 'ECO-2',
        autoCompactTokenLimit: this.ecoTwoAutoCompactTokenLimit,
        historyTargetTokens: this.ecoTwoHistoryTargetTokens,
        userMessageTokenLimit: this.ecoTwoUserMessageTokenLimit,
      };
    }
    if (this.isEcoThree(job)) {
      return {
        label: 'ECO-3',
        autoCompactTokenLimit: this.ecoThreeAutoCompactTokenLimit,
        historyTargetTokens: this.ecoThreeHistoryTargetTokens,
        userMessageTokenLimit: this.ecoThreeUserMessageTokenLimit,
      };
    }
    return undefined;
  }

  private enforceEcoThreeGuardrails(job: SandboxJob, turnCount: number): void {
    if (!this.isEcoThree(job)) {
      return;
    }
    if (this.ecoThreeMaxTurns > 0 && turnCount > this.ecoThreeMaxTurns) {
      throw new Error(
        `Modo ECO-3 interrompeu a execução após ${turnCount} iterações para evitar ultrapassar o limite de ${this.ecoThreeMaxTurns} turnos. Resuma o estado atual e encerre a tarefa manualmente.`,
      );
    }
    const totalTokens = job.totalTokens ?? 0;
    if (this.ecoThreeMaxTotalTokens > 0 && totalTokens >= this.ecoThreeMaxTotalTokens) {
      throw new Error(
        `Modo ECO-3 atingiu ${totalTokens} tokens (limite ${this.ecoThreeMaxTotalTokens}) e encerrou automaticamente para conter custos. Gere um resumo e finalize o fluxo manualmente.`,
      );
    }
  }

  private isEcoRemovableHistoryItem(item: ResponseItem | undefined): boolean {
    if (!item) {
      return false;
    }
    if (item.type === 'function_call' || item.type === 'function_call_output') {
      return true;
    }
    if (item.type === 'message') {
      const message = item as ResponseOutputMessage;
      const role = (message as { role?: string }).role ?? 'assistant';
      return role === 'assistant';
    }
    return false;
  }

  private estimateMessagesTokenFootprint(messages: ResponseItem[]): number {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }
    return messages.reduce((total, item) => total + this.estimateItemTokenFootprint(item), 0);
  }

  private estimateItemTokenFootprint(item: ResponseItem | undefined): number {
    if (!item) {
      return 0;
    }
    if (item.type === 'message') {
      const message = item as ResponseOutputMessage;
      return this.approximateTokensFromText(this.collectMessageTexts(message.content));
    }
    if (item.type === 'function_call') {
      const call = item as ResponseFunctionToolCallItem;
      return this.approximateTokensFromText(this.safeStringify({
        name: call.name ?? 'tool_call',
        arguments: call.arguments ?? {},
      }));
    }
    if (item.type === 'function_call_output') {
      const output = item as ResponseFunctionToolCallOutputItem;
      return this.approximateTokensFromText(
        typeof output.output === 'string' ? output.output : this.safeStringify(output.output ?? {}),
      );
    }
    return this.approximateTokensFromText(this.safeStringify(item));
  }

  private approximateTokensFromText(value: string | undefined): number {
    if (!value) {
      return 0;
    }
    return Math.max(1, Math.ceil(value.length / Math.max(1, this.ecoTwoCharsPerTokenEstimate)));
  }

  private truncateTextByTokenBudget(
    text: string,
    tokenBudget: number,
  ): { value: string; truncated: boolean; omittedTokens: number } {
    if (!text) {
      return { value: '', truncated: false, omittedTokens: 0 };
    }
    const safeBudget = Math.max(1, Math.floor(tokenBudget));
    const estimated = this.approximateTokensFromText(text);
    if (estimated <= safeBudget) {
      return { value: text, truncated: false, omittedTokens: 0 };
    }
    const charBudget = Math.max(1, safeBudget * this.ecoTwoCharsPerTokenEstimate);
    const trimmed = `${text.slice(0, Math.max(0, charBudget - 1))}…`;
    const omittedTokens = Math.max(0, estimated - safeBudget);
    return { value: trimmed, truncated: true, omittedTokens };
  }

  private truncateStringFields(value: unknown, maxLength: number, tracker: { truncated: boolean }): unknown {
    if (typeof value === 'string') {
      const truncated = this.truncateStringValue(value, maxLength);
      tracker.truncated = tracker.truncated || truncated.truncated;
      return truncated.value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.truncateStringFields(item, maxLength, tracker));
    }

    if (value && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.truncateStringFields(val, maxLength, tracker);
      }
      return result;
    }

    return value;
  }

  private truncateStringValue(value: string, maxLength: number): { value: string; truncated: boolean; omitted: number } {
    if (!Number.isFinite(maxLength) || maxLength <= 0 || value.length <= maxLength) {
      return { value, truncated: false, omitted: 0 };
    }

    const suffixBase = '... [truncated ';
    const suffixClose = ' chars]';
    const suffixLength = suffixBase.length + suffixClose.length + String(value.length).length;
    const available = Math.max(0, maxLength - suffixLength);
    const omitted = Math.max(0, value.length - available);
    const suffix = `${suffixBase}${omitted}${suffixClose}`;
    const truncatedValue = `${value.slice(0, available)}${suffix}`;

    return { value: truncatedValue, truncated: true, omitted };
  }

  private parsePositiveInteger(raw: string | undefined, defaultValue: number): number {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  }
}
