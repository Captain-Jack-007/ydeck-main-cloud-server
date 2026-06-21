import dotenv from 'dotenv';
dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env var ${name} must be a number`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(raw.toLowerCase());
}

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Env var ${name} must be one of: ${allowed.join(', ')}`);
}

const llmProvider = oneOf(
  'LLM_PROVIDER',
  process.env.LLM_PROVIDER ?? process.env.CLOUD_LLM_PROVIDER ?? 'deepseek',
  ['mock', 'openai', 'gemini', 'deepseek', 'openai-compatible'] as const
);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 2026),
  databaseUrl: required('DATABASE_URL', 'mongodb://localhost:27017/ydeck'),

  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-me'),
  jwtRefreshSecret: required(
    'JWT_REFRESH_SECRET',
    'dev-refresh-secret-change-me'
  ),
  jwtAccessTtl: num('JWT_ACCESS_TTL', 60 * 15),
  jwtRefreshTtl: num('JWT_REFRESH_TTL', 60 * 60 * 24 * 30),

  deviceTokenTtl: num('DEVICE_TOKEN_TTL', 60 * 60 * 24 * 30),
  pairingCodeTtl: num('PAIRING_CODE_TTL', 60 * 10),

  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',

  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  agentLoopEnabled: (process.env.AGENT_LOOP_ENABLED ?? 'true') !== 'false',
  agentLoopMaxRounds: num('AGENT_LOOP_MAX_ROUNDS', 4),
  agentLoopMaxTools: num('AGENT_LOOP_MAX_TOOLS', 8),

  llmProvider,
  openaiApiKey: process.env.OPENAI_API_KEY ?? process.env.CLOUD_OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? process.env.CLOUD_OPENAI_MODEL ?? 'gpt-4.1-mini',
  geminiApiKey: process.env.GEMINI_API_KEY ?? process.env.CLOUD_GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? process.env.CLOUD_GEMINI_MODEL ?? 'gemini-2.5-flash',
  deepseekApiKey:
    process.env.DEEPSEEK_API_KEY ??
    process.env.CLOUD_DEEPSEEK_API_KEY ??
    (llmProvider === 'deepseek' ? process.env.CLOUD_LLM_API_KEY : undefined) ??
    '',
  deepseekModel:
    process.env.DEEPSEEK_MODEL ??
    process.env.CLOUD_DEEPSEEK_MODEL ??
    (llmProvider === 'deepseek' ? process.env.CLOUD_LLM_MODEL : undefined) ??
    'deepseek-chat',
  llmBaseUrl: process.env.LLM_BASE_URL ?? process.env.CLOUD_LLM_BASE_URL ?? '',
  llmModel: process.env.LLM_MODEL ?? process.env.CLOUD_LLM_MODEL ?? 'ydeck-cloud-agent',
  llmApiKey: process.env.LLM_API_KEY ?? process.env.CLOUD_LLM_API_KEY ?? '',
  llmStreamOutput: bool('LLM_STREAM_OUTPUT', true),
  llmLogOutput: bool('LLM_LOG_OUTPUT', true),
  llmMaxTokens: num('LLM_MAX_TOKENS', 8192),
  agentFlowLogOutput: bool('AGENT_FLOW_LOG_OUTPUT', process.env.NODE_ENV !== 'production'),

  pexelsApiKey:
    process.env.PEXELS_IMAGE_SEARCH_API ??
    process.env.PEXELS_API_KEY ??
    process.env.PEXELS_API ??
    process.env.CLOUD_PEXELS_API_KEY ??
    '',
  tavilyApiKey:
    process.env.TAVILY_WEB_SEARCH_API ??
    process.env.TAVILY_API_KEY ??
    process.env.CLOUD_TAVILY_API_KEY ??
    '',
};

export const isProd = env.nodeEnv === 'production';
