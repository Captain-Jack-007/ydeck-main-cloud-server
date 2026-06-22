import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export type CloudProviderName =
  | 'mock'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'openai-compatible';

export interface LlmGenerateOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface ModelStatus {
  provider: CloudProviderName;
  model: string;
  status: 'available' | 'unavailable' | 'unknown';
  localOnly: false;
  detail?: string;
}

export interface CloudLlmProvider {
  readonly name: CloudProviderName;
  readonly model: string;
  generate(prompt: string, options?: LlmGenerateOptions): Promise<string>;
  getStatus(): Promise<ModelStatus>;
}

export const CLOUD_PROVIDERS: CloudProviderName[] = [
  'mock',
  'openai',
  'anthropic',
  'gemini',
  'deepseek',
  'openai-compatible',
];

export const CLOUD_MODELS: Record<
  Exclude<CloudProviderName, 'mock'>,
  string[]
> = {
  openai: [
    'gpt-5',
    'gpt-5-mini',
    'gpt-5-nano',
    'gpt-5.4',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
    'o4-mini',
  ],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  deepseek: ['deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner'],
  'openai-compatible': ['custom'],
};

export interface EffectiveCloudConfig {
  llmProvider: CloudProviderName;
  models: Record<Exclude<CloudProviderName, 'mock'>, string>;
  keys: Record<Exclude<CloudProviderName, 'mock'>, string>;
  baseUrls: { 'openai-compatible': string };
  streamOutput: boolean;
  logOutput: boolean;
}

type StoredProvider = Exclude<CloudProviderName, 'mock'>;

let configCache: EffectiveCloudConfig | null = null;
let configCacheAt = 0;
const CACHE_MS = 5_000;

export async function effectiveCloudConfig(): Promise<EffectiveCloudConfig> {
  const now = Date.now();
  if (configCache && now - configCacheAt < CACHE_MS) return configCache;
  // Single source of truth: .env. The DB CloudConfig is never read at runtime.
  configCache = {
    llmProvider: normalizeProvider(env.llmProvider),
    models: {
      openai: env.openaiModel,
      anthropic: 'claude-sonnet-4-6',
      gemini: env.geminiModel,
      deepseek: env.deepseekModel,
      'openai-compatible': env.llmModel,
    },
    keys: {
      openai: env.openaiApiKey,
      anthropic: '',
      gemini: env.geminiApiKey,
      deepseek: env.deepseekApiKey,
      'openai-compatible': env.llmApiKey,
    },
    baseUrls: {
      'openai-compatible': env.llmBaseUrl,
    },
    streamOutput: env.llmStreamOutput,
    logOutput: env.llmLogOutput,
  };
  configCacheAt = now;
  return configCache;
}

export async function getCloudLlmProvider(
  config?: EffectiveCloudConfig
): Promise<CloudLlmProvider> {
  const cfg = config ?? (await effectiveCloudConfig());
  const primary = buildProvider(cfg.llmProvider, cfg);
  const fallbackName = pickFallback(cfg);
  if (!fallbackName || fallbackName === cfg.llmProvider) return primary;
  return new FallbackProvider(primary, buildProvider(fallbackName, cfg));
}

function buildProvider(
  name: CloudProviderName,
  cfg: EffectiveCloudConfig
): CloudLlmProvider {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(cfg.keys.openai, cfg.models.openai, cfg);
    case 'anthropic':
      return new AnthropicProvider(
        cfg.keys.anthropic,
        cfg.models.anthropic,
        cfg
      );
    case 'gemini':
      return new GeminiProvider(cfg.keys.gemini, cfg.models.gemini, cfg);
    case 'deepseek':
      return new DeepSeekProvider(cfg.keys.deepseek, cfg.models.deepseek, cfg);
    case 'openai-compatible':
      return new OpenAICompatibleProvider(
        cfg.keys['openai-compatible'],
        cfg.models['openai-compatible'],
        cfg.baseUrls['openai-compatible'],
        cfg
      );
    default:
      return new MockDeckProvider();
  }
}

// OpenAI and DeepSeek act as automatic fallbacks for each other whenever the
// other key is configured. Set LLM_FALLBACK_ENABLED=false to disable.
function pickFallback(cfg: EffectiveCloudConfig): CloudProviderName | null {
  if (!env.llmFallbackEnabled) return null;
  if (cfg.llmProvider === 'openai' && cfg.keys.deepseek) return 'deepseek';
  if (cfg.llmProvider === 'deepseek' && cfg.keys.openai) return 'openai';
  return null;
}

export async function getCloudModelStatus(): Promise<ModelStatus> {
  return (await getCloudLlmProvider()).getStatus();
}

export async function testCloudProvider(input: {
  provider: StoredProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<ModelStatus> {
  const cfg = await effectiveCloudConfig();
  const model = input.model ?? cfg.models[input.provider];
  const key = input.apiKey ?? cfg.keys[input.provider];
  const provider =
    input.provider === 'openai'
      ? new OpenAIProvider(key, model, cfg)
      : input.provider === 'anthropic'
      ? new AnthropicProvider(key, model, cfg)
      : input.provider === 'gemini'
      ? new GeminiProvider(key, model, cfg)
      : input.provider === 'deepseek'
      ? new DeepSeekProvider(key, model, cfg)
      : new OpenAICompatibleProvider(
          key,
          model,
          input.baseUrl ?? cfg.baseUrls['openai-compatible'],
          cfg
        );
  return provider.getStatus();
}

class OpenAIProvider implements CloudLlmProvider {
  readonly name = 'openai' as const;
  constructor(
    private apiKey: string,
    readonly model: string,
    private cfg: EffectiveCloudConfig
  ) {}
  async generate(
    prompt: string,
    options: LlmGenerateOptions = {}
  ): Promise<string> {
    if (!this.apiKey) throw new Error('OpenAI API key not set');
    return callOpenAICompatible({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: this.apiKey,
      model: this.model,
      prompt,
      options,
      providerName: 'OpenAI',
      cfg: this.cfg,
    });
  }
  async getStatus(): Promise<ModelStatus> {
    if (!this.apiKey)
      return unavailable(this.name, this.model, 'API key not set');
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }).catch((err) => err as Error);
    if (res instanceof Error)
      return unavailable(this.name, this.model, res.message);
    return res.ok
      ? available(this.name, this.model)
      : unavailable(this.name, this.model, `${res.status} ${await res.text()}`);
  }
}

class OpenAICompatibleProvider implements CloudLlmProvider {
  readonly name = 'openai-compatible' as const;
  constructor(
    private apiKey: string,
    readonly model: string,
    private baseUrl: string,
    private cfg: EffectiveCloudConfig
  ) {}
  async generate(
    prompt: string,
    options: LlmGenerateOptions = {}
  ): Promise<string> {
    if (!this.baseUrl) throw new Error('OpenAI-compatible base URL not set');
    return callOpenAICompatible({
      endpoint: `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      apiKey: this.apiKey,
      model: this.model,
      prompt,
      options,
      providerName: 'OpenAI-compatible LLM',
      cfg: this.cfg,
    });
  }
  async getStatus(): Promise<ModelStatus> {
    if (!this.baseUrl)
      return unavailable(this.name, this.model, 'Base URL not set');
    return {
      provider: this.name,
      model: this.model,
      status: 'unknown',
      localOnly: false,
      detail: 'Custom endpoints are tested on first generation request.',
    };
  }
}

class GeminiProvider implements CloudLlmProvider {
  readonly name = 'gemini' as const;
  constructor(
    private apiKey: string,
    readonly model: string,
    private cfg: EffectiveCloudConfig
  ) {}
  async generate(
    prompt: string,
    options: LlmGenerateOptions = {}
  ): Promise<string> {
    if (!this.apiKey) throw new Error('Gemini API key not set');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:${
      this.cfg.streamOutput
        ? 'streamGenerateContent?alt=sse'
        : 'generateContent'
    }`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.4,
          maxOutputTokens: options.maxTokens ?? 3500,
        },
      }),
    });
    if (!res.ok)
      throw new Error(
        `Gemini request failed: ${res.status} ${await res.text()}`
      );
    if (this.cfg.streamOutput) {
      return readSseTextStream(res, 'Gemini', this.cfg, (data) => {
        const body = JSON.parse(data) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        return (
          body.candidates?.[0]?.content?.parts
            ?.map((part) => part.text ?? '')
            .join('') ?? ''
        );
      });
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('') ?? '';
    logFullLlmOutput('Gemini', text, this.cfg);
    return text;
  }
  async getStatus(): Promise<ModelStatus> {
    if (!this.apiKey)
      return unavailable(this.name, this.model, 'API key not set');
    return available(this.name, this.model);
  }
}

class DeepSeekProvider implements CloudLlmProvider {
  readonly name = 'deepseek' as const;
  constructor(
    private apiKey: string,
    readonly model: string,
    private cfg: EffectiveCloudConfig
  ) {}
  async generate(
    prompt: string,
    options: LlmGenerateOptions = {}
  ): Promise<string> {
    if (!this.apiKey) throw new Error('DeepSeek API key not set');
    return callOpenAICompatible({
      endpoint: 'https://api.deepseek.com/chat/completions',
      apiKey: this.apiKey,
      model: this.model,
      prompt,
      options,
      providerName: 'DeepSeek',
      cfg: this.cfg,
    });
  }
  async getStatus(): Promise<ModelStatus> {
    if (!this.apiKey)
      return unavailable(this.name, this.model, 'API key not set');
    return available(this.name, this.model);
  }
}

class AnthropicProvider implements CloudLlmProvider {
  readonly name = 'anthropic' as const;
  constructor(
    private apiKey: string,
    readonly model: string,
    private cfg: EffectiveCloudConfig
  ) {}
  async generate(
    prompt: string,
    options: LlmGenerateOptions = {}
  ): Promise<string> {
    if (!this.apiKey) throw new Error('Anthropic API key not set');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 3500,
        temperature: options.temperature ?? 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok)
      throw new Error(
        `Anthropic request failed: ${res.status} ${await res.text()}`
      );
    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      body.content
        ?.filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('') ?? '';
    logFullLlmOutput('Anthropic', text, this.cfg);
    return text;
  }
  async getStatus(): Promise<ModelStatus> {
    return this.apiKey
      ? available(this.name, this.model)
      : unavailable(this.name, this.model, 'API key not set');
  }
}

class FallbackProvider implements CloudLlmProvider {
  // Reports as the primary so existing logs/metering remain stable.
  readonly name: CloudProviderName;
  readonly model: string;
  constructor(
    private readonly primary: CloudLlmProvider,
    private readonly fallback: CloudLlmProvider
  ) {
    this.name = primary.name;
    this.model = primary.model;
  }
  async generate(
    prompt: string,
    options?: LlmGenerateOptions
  ): Promise<string> {
    try {
      return await this.primary.generate(prompt, options);
    } catch (err) {
      logger.warn(
        { err, primary: this.primary.name, fallback: this.fallback.name },
        'cloud_llm.primary_failed_using_fallback'
      );
      return this.fallback.generate(prompt, options);
    }
  }
  async getStatus(): Promise<ModelStatus> {
    const primary = await this.primary.getStatus();
    if (primary.status === 'available') return primary;
    const fallback = await this.fallback.getStatus();
    return {
      ...primary,
      detail: `primary ${this.primary.name} ${primary.status}${
        primary.detail ? `: ${primary.detail}` : ''
      }; fallback ${this.fallback.name} ${fallback.status}`,
    };
  }
}

async function callOpenAICompatible(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  prompt: string;
  options: LlmGenerateOptions;
  providerName: string;
  cfg: EffectiveCloudConfig;
}): Promise<string> {
  const res = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.options.temperature ?? 0.4,
      max_tokens: input.options.maxTokens ?? 3500,
      stream: input.cfg.streamOutput,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });
  if (!res.ok)
    throw new Error(
      `${input.providerName} request failed: ${res.status} ${await res.text()}`
    );
  if (input.cfg.streamOutput) {
    return readSseTextStream(res, input.providerName, input.cfg, (data) => {
      const body = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      return body.choices?.[0]?.delta?.content ?? '';
    });
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = body.choices?.[0]?.message?.content ?? '';
  logFullLlmOutput(input.providerName, text, input.cfg);
  return text;
}

async function readSseTextStream(
  res: Response,
  providerName: string,
  cfg: EffectiveCloudConfig,
  pickText: (data: string) => string
): Promise<string> {
  if (!res.body)
    throw new Error(
      `${providerName} response did not include a readable stream`
    );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';
  logLlmPrefix(providerName, cfg);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) output += readSsePart(part, pickText, cfg);
  }
  buffer += decoder.decode();
  if (buffer.trim()) output += readSsePart(buffer, pickText, cfg);
  logLlmSuffix(cfg);
  return output;
}

function readSsePart(
  part: string,
  pickText: (data: string) => string,
  cfg: EffectiveCloudConfig
): string {
  let output = '';
  for (const line of part.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    const text = pickText(data);
    if (!text) continue;
    output += text;
    logLlmChunk(text, cfg);
  }
  return output;
}

function logFullLlmOutput(
  providerName: string,
  text: string,
  cfg: EffectiveCloudConfig
): void {
  logLlmPrefix(providerName, cfg);
  logLlmChunk(text, cfg);
  logLlmSuffix(cfg);
}

function logLlmPrefix(providerName: string, cfg: EffectiveCloudConfig): void {
  if (!cfg.logOutput) return;
  process.stdout.write(`\n[${providerName} LLM output]\n`);
}

function logLlmChunk(text: string, cfg: EffectiveCloudConfig): void {
  if (!cfg.logOutput) return;
  process.stdout.write(text);
}

function logLlmSuffix(cfg: EffectiveCloudConfig): void {
  if (!cfg.logOutput) return;
  process.stdout.write('\n[/LLM output]\n');
}

class MockDeckProvider implements CloudLlmProvider {
  readonly name = 'mock' as const;
  readonly model = 'mock';
  async generate(prompt: string): Promise<string> {
    const title = titleFromPrompt(prompt);
    const deck = {
      deckTitle: title,
      deckType: 'general',
      designStyle: 'modern',
      language: 'en',
      summary:
        'Generated by the cloud agent mock provider. Configure the main server cloud provider for real model output.',
      slides: [
        {
          slideNumber: 1,
          slideType: 'title',
          title,
          subtitle: 'Cloud generated presentation',
          bullets: ['Purpose, audience, and desired outcome'],
          html: mockSlideHtml(
            title,
            'Cloud generated presentation',
            ['Purpose, audience, and desired outcome'],
            1
          ),
        },
        {
          slideNumber: 2,
          slideType: 'overview',
          title: 'Key Message',
          bullets: [
            'Clarify the main thesis',
            'Organize supporting points',
            'Prepare for follow-up refinement',
          ],
          html: mockSlideHtml(
            'Key Message',
            'Organized for review',
            [
              'Clarify the main thesis',
              'Organize supporting points',
              'Prepare for follow-up refinement',
            ],
            2
          ),
        },
        {
          slideNumber: 3,
          slideType: 'next_steps',
          title: 'Next Steps',
          bullets: [
            'Review the generated outline',
            'Refine content and style',
            'Export when ready',
          ],
          html: mockSlideHtml(
            'Next Steps',
            'Move from draft to polished deck',
            [
              'Review the generated outline',
              'Refine content and style',
              'Export when ready',
            ],
            3
          ),
        },
      ],
    };
    return [
      'I will create the deck artifact now.',
      '',
      '```tool',
      JSON.stringify({ name: 'create_deck', arguments: { deck } }, null, 2),
      '```',
    ].join('\n');
  }
  async getStatus(): Promise<ModelStatus> {
    return available(this.name, this.model);
  }
}

function available(provider: CloudProviderName, model: string): ModelStatus {
  return { provider, model, status: 'available', localOnly: false };
}

function unavailable(
  provider: CloudProviderName,
  model: string,
  detail: string
): ModelStatus {
  return { provider, model, status: 'unavailable', localOnly: false, detail };
}

function normalizeProvider(value: unknown): CloudProviderName {
  return CLOUD_PROVIDERS.includes(value as CloudProviderName)
    ? (value as CloudProviderName)
    : 'mock';
}

function titleFromPrompt(prompt: string): string {
  const match =
    /Project:\s*(.+)/i.exec(prompt) ??
    /User request:\s*([\s\S]+?)(?:\n\n|$)/i.exec(prompt);
  const raw = (match?.[1] ?? 'Untitled Cloud Deck').replace(/\s+/g, ' ').trim();
  return raw.slice(0, 90) || 'Untitled Cloud Deck';
}

function mockSlideHtml(
  title: string,
  subtitle: string,
  bullets: string[],
  n: number
): string {
  const accent = ['#7c3aed', '#06b6d4', '#22c55e'][n % 3];
  return `<section class="ydeck-slide" style="position:relative;width:1920px;height:1080px;box-sizing:border-box;overflow:hidden;background:linear-gradient(135deg,#111827,#312e81);color:#f8fafc;font-family:Inter,Arial,sans-serif;padding:96px 112px;">
  <div style="position:absolute;inset:0;background:radial-gradient(circle at 82% 20%,${accent}66 0,transparent 360px);"></div>
  <div style="position:relative;z-index:1;max-width:1180px">
    <div style="font-size:28px;text-transform:uppercase;color:#cbd5e1;font-weight:700;margin-bottom:140px">YDeck Cloud</div>
    <h1 style="font-size:92px;line-height:1.02;margin:0 0 28px;font-weight:800">${escapeMock(
      title
    )}</h1>
    <p style="font-size:44px;color:#dbeafe;margin:0 0 48px">${escapeMock(
      subtitle
    )}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">${bullets
      .map(
        (b) =>
          `<div style="font-size:32px;line-height:1.25;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:22px;padding:26px 30px">${escapeMock(
            b
          )}</div>`
      )
      .join('')}</div>
  </div>
</section>`;
}

function escapeMock(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
