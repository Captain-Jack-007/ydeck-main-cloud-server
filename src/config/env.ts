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

function oneOf<T extends string>(name: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Env var ${name} must be one of: ${allowed.join(', ')}`);
}

const llmProvider = oneOf(
  'LLM_PROVIDER',
  process.env.LLM_PROVIDER ?? process.env.CLOUD_LLM_PROVIDER ?? 'mock',
  ['mock', 'openai', 'gemini', 'deepseek', 'openai-compatible'] as const
);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num('PORT', 3000),
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
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
  llmBaseUrl: process.env.LLM_BASE_URL ?? process.env.CLOUD_LLM_BASE_URL ?? '',
  llmModel: process.env.LLM_MODEL ?? process.env.CLOUD_LLM_MODEL ?? 'ydeck-cloud-agent',
  llmApiKey: process.env.LLM_API_KEY ?? process.env.CLOUD_LLM_API_KEY ?? '',
};

export const isProd = env.nodeEnv === 'production';
