// Anthropic SDK ラッパ
//
// 設計方針:
//   - ModelRole で役割抽象化、モデル名は env で差し替え
//   - System prompt は prompts/*.md からロードし、Anthropic prompt caching を有効化
//   - JSON 出力は JSON.parse → zod 再検証で型安全に取り出す
//   - 生レスポンスはルートからクライアントへ漏らさない
//   - ANTHROPIC_API_KEY 未設定 or KAMEO_USE_STUBS=true なら disabled。
//     ルート側で isLLMEnabled() を見てスタブにフォールバックさせる

import Anthropic from '@anthropic-ai/sdk';
import type { ZodSchema } from 'zod';

export type ModelRole =
  | 'generation'
  | 'dialogue'
  | 'judge'
  | 'solve-check'
  | 'safety'
  | 'nakamoto-hint';

// 公式Docs (https://platform.claude.com/docs/en/about-claude/models/overview)
// 記載のスナップショットIDをデフォルトに採用。
// 本番ではエイリアスではなくスナップショットIDを使うのが推奨。
// env (KAMEO_MODEL_*) で上書き可能。
const DEFAULT_MODELS: Record<ModelRole, string> = {
  generation: 'claude-opus-4-5-20251101',
  dialogue: 'claude-sonnet-4-5-20250929',
  judge: 'claude-sonnet-4-5-20250929',
  'solve-check': 'claude-sonnet-4-5-20250929',
  safety: 'claude-haiku-4-5-20251001',
  'nakamoto-hint': 'claude-sonnet-4-5-20250929',
};

const ENV_KEYS: Record<ModelRole, string> = {
  generation: 'KAMEO_MODEL_GENERATION',
  dialogue: 'KAMEO_MODEL_DIALOGUE',
  judge: 'KAMEO_MODEL_JUDGE',
  'solve-check': 'KAMEO_MODEL_SOLVE_CHECK',
  safety: 'KAMEO_MODEL_SAFETY',
  'nakamoto-hint': 'KAMEO_MODEL_NAKAMOTO_HINT',
};

function getModelName(role: ModelRole): string {
  return process.env[ENV_KEYS[role]] || DEFAULT_MODELS[role];
}

export function isLLMEnabled(): boolean {
  if (process.env.KAMEO_USE_STUBS === 'true') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LLMError('no_api_key', 'ANTHROPIC_API_KEY is not set');
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export interface CallLLMArgs {
  role: ModelRole;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
}

export class LLMError extends Error {
  constructor(
    public code:
      | 'no_api_key'
      | 'sdk_error'
      | 'json_parse_failed'
      | 'schema_invalid'
      | 'empty_response',
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function callLLM(args: CallLLMArgs): Promise<string> {
  const client = getClient();
  let res;
  try {
    res = await client.messages.create({
      model: getModelName(args.role),
      max_tokens: args.maxTokens ?? 4096,
      temperature: args.temperature ?? 0.7,
      system: [
        {
          type: 'text',
          text: args.systemPrompt,
          // 大きく安定したプロンプト本文をキャッシュさせる
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: args.userMessage }],
    });
  } catch (e) {
    throw new LLMError('sdk_error', `Anthropic SDK error: ${(e as Error).message}`, e);
  }

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');

  if (!text.trim()) {
    throw new LLMError('empty_response', 'LLM returned empty text');
  }
  return text;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

export async function callLLMJson<T>(
  args: CallLLMArgs,
  schema: ZodSchema<T>,
): Promise<T> {
  const text = await callLLM(args);
  const cleaned = stripCodeFences(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new LLMError(
      'json_parse_failed',
      'Failed to parse LLM output as JSON',
      { raw: text, parse_error: (e as Error).message },
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LLMError(
      'schema_invalid',
      'LLM output failed schema validation',
      { issues: result.error.issues, raw: text },
    );
  }
  return result.data;
}

// プロンプトキャッシュ（ファイルI/O削減）
const promptCache = new Map<string, string>();
export function cachePrompt(name: string, content: string): void {
  promptCache.set(name, content);
}
export function getCachedPrompt(name: string): string | null {
  return promptCache.get(name) ?? null;
}

// LLMError.details からログ向けに raw を伏せた diagnostic を返す。
// raw（LLMの生応答）には truth / hidden_truth が混ざるため、開発中であっても
// console.* に流すのは避ける。issues / errors / regenerate_focus などの
// 構造化情報は残し、トラブルシュートに使えるようにする。
export function redactLLMErrorDetails(e: unknown): unknown {
  if (!(e instanceof LLMError)) return null;
  if (e.details === undefined || e.details === null) return null;
  if (typeof e.details !== 'object') return null;

  const src = e.details as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(src)) {
    if (key === 'raw') {
      out.raw = '[redacted]';
      continue;
    }
    out[key] = value;
  }
  return out;
}
