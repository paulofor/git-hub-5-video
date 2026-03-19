export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type SandboxProfile = 'STANDARD' | 'ECONOMY' | 'SMART_ECONOMY' | 'ECO_1' | 'ECO_2' | 'ECO_3' | 'CHATGPT_CODEX';

export type InteractionDirection = 'OUTBOUND' | 'INBOUND';

export interface SandboxDatabaseConfig {
  host: string;
  port?: number;
  database: string;
  user: string;
  password?: string;
}

export interface SandboxInteraction {
  id: string;
  direction: InteractionDirection;
  content: string;
  tokenCount?: number;
  createdAt: string;
  sequence: number;
}

export interface SandboxHttpRequestLog {
  callId?: string;
  url: string;
  status?: number;
  success: boolean;
  toolName: string;
  requestedAt: string;
}

export interface SandboxJob {
  jobId: string;
  repoSlug?: string;
  repoUrl: string;
  branch: string;
  taskDescription: string;
  testCommand?: string;
  commitHash?: string;
  profile?: SandboxProfile;
  model?: string;
  callbackUrl?: string;
  callbackSecret?: string;
  status: JobStatus;
  summary?: string;
  interactions: SandboxInteraction[];
  interactionSequence: number;
  changedFiles?: string[];
  patch?: string;
  pullRequestUrl?: string;
  error?: string;
  sandboxPath?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  database?: SandboxDatabaseConfig;
  logs: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  timeoutCount: number;
  httpGetCount?: number;
  httpGetSuccessCount?: number;
  dbQueryCount?: number;
  cancelRequested?: boolean;
  httpRequests?: SandboxHttpRequestLog[];
}

export interface JobProcessor {
  process(job: SandboxJob): Promise<void>;
}
