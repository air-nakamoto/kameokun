import { z } from 'zod';
import { NextResponse } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import {
  BadRequestError,
  badRequest,
  parseJsonBody,
  validate,
} from '@/lib/api-utils';
import { createSession } from '@/lib/session-store';
import type { KameokunProblem } from '@/lib/types';
import {
  callLLM,
  isLLMEnabled,
  LLMError,
  redactLLMErrorDetails,
} from '@/lib/llm';
import { JudgeOutputSchema } from '@/lib/llm-schemas';
import {
  validateProblem,
  type ValidationError,
} from '@/lib/validate-problem';
import validProblem from '@/scripts/fixtures/valid-problem.json' with { type: 'json' };

const MAX_GENERATION_ATTEMPTS = 3;

const InputSchema = z.object({
  situation_type: z
    .enum(['workplace', 'family', 'school', 'daily', 'service', 'community', 'other'])
    .optional(),
  difficulty: z.enum(['beginner', 'standard', 'advanced']).optional(),
  tone: z.enum(['light', 'normal', 'heavy']).optional(),
  pattern_tuple: z
    .object({
      charm_pattern: z.string(),
      misdirection: z.string(),
      truth_reveal: z.string(),
      solution_shape: z.string(),
    })
    .optional(),
});
type InputParams = z.infer<typeof InputSchema>;

type FeedbackReason =
  | 'json_parse_failed'
  | 'validation_failed'
  | 'judge_rejected'
  | 'judge_schema_mismatch';

interface AttemptFeedback {
  previous_attempt: number;
  reason: FeedbackReason;
  instruction: string;
  regenerate_focus?: string[];
  validation_errors?: Array<{ path: string; message: string }>;
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function buildFeedbackFromError(
  attempt: number,
  e: LLMError,
): AttemptFeedback | null {
  const details = (e.details ?? {}) as Record<string, unknown>;

  if (e.code === 'json_parse_failed') {
    return {
      previous_attempt: attempt,
      reason: 'json_parse_failed',
      instruction:
        '前回の応答はJSONパースに失敗しました。今回は必ず「JSON単体」を返してください。前後のテキスト・コードフェンス・コメントを一切付けず、{ から始めて } で終わる純粋なJSONのみ。',
    };
  }

  if (e.code === 'schema_invalid') {
    if (Array.isArray(details.regenerate_focus)) {
      return {
        previous_attempt: attempt,
        reason: 'judge_rejected',
        regenerate_focus: details.regenerate_focus as string[],
        instruction:
          '前回の問題は judgeModel の品質ゲートで不合格でした。下記 regenerate_focus の各項目を解消したうえで、9つの fail_conditions を再点検し、JSON単体で再出力してください。',
      };
    }
    if (Array.isArray(details.errors)) {
      const errs = details.errors as ValidationError[];
      return {
        previous_attempt: attempt,
        reason: 'validation_failed',
        validation_errors: errs.map(x => ({ path: x.path, message: x.message })),
        instruction:
          '前回の問題は構造検証（JSON Schema または クロス参照）で不合格でした。validation_errors の各項目を修正してください。特にID一意性・参照整合性・9コードの網羅性に注意。',
      };
    }
    if (Array.isArray(details.issues)) {
      // judge 自身がスキーマ不一致だったケース。次は generation 側を作り直して様子見。
      return {
        previous_attempt: attempt,
        reason: 'judge_schema_mismatch',
        instruction:
          '前回の判定処理が不安定でした。問題JSONをスキーマ通り厳密に出してください。',
      };
    }
  }

  return null;
}

function buildUserMessage(
  input: InputParams,
  feedback: AttemptFeedback | null,
): string {
  const payload: Record<string, unknown> = {
    $SITUATION_TYPE: input.situation_type ?? 'workplace',
    $DIFFICULTY: input.difficulty ?? 'standard',
    $TONE: input.tone ?? 'normal',
    $PATTERN_TUPLE: input.pattern_tuple ?? null,
    $FORBIDDEN_TUPLES: [],
    $FORBIDDEN_ITEMS: ['付箋', '伝わらない報告書', 'プロジェクトの重圧'],
  };
  if (feedback) {
    payload.$PREVIOUS_ATTEMPT_FEEDBACK = feedback;
  }
  return JSON.stringify(payload);
}

async function attemptGeneration(
  systemPrompt: string,
  judgePrompt: string,
  input: InputParams,
  feedback: AttemptFeedback | null,
): Promise<KameokunProblem> {
  const userMessage = buildUserMessage(input, feedback);

  const text = await callLLM({
    role: 'generation',
    systemPrompt,
    userMessage,
    temperature: 0.9,
    maxTokens: 6000,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch (e) {
    throw new LLMError(
      'json_parse_failed',
      'generationModel did not return valid JSON',
      { raw: text, parse_error: (e as Error).message },
    );
  }

  const validation = validateProblem(parsed);
  if (!validation.ok) {
    throw new LLMError('schema_invalid', 'Generated problem failed validation', {
      errors: validation.errors,
    });
  }

  const judgeText = await callLLM({
    role: 'judge',
    systemPrompt: judgePrompt,
    userMessage: JSON.stringify({ $PROBLEM: parsed, $FORBIDDEN_TUPLES: [] }),
    temperature: 0.0,
    maxTokens: 2000,
  });
  let judgeParsed: unknown;
  try {
    judgeParsed = JSON.parse(stripCodeFences(judgeText));
  } catch (e) {
    throw new LLMError('json_parse_failed', 'judgeModel returned non-JSON', {
      raw: judgeText,
      parse_error: (e as Error).message,
    });
  }
  const judgeResult = JudgeOutputSchema.safeParse(judgeParsed);
  if (!judgeResult.success) {
    throw new LLMError('schema_invalid', 'judgeModel output failed schema', {
      issues: judgeResult.error.issues,
    });
  }
  if (!judgeResult.data.passed) {
    throw new LLMError(
      'schema_invalid',
      'Generated problem rejected by judgeModel',
      {
        regenerate_focus: judgeResult.data.regenerate_focus,
        structural_invalid: judgeResult.data.structural_invalid,
      },
    );
  }

  return parsed as KameokunProblem;
}

async function generateProblem(input: InputParams): Promise<KameokunProblem> {
  if (!isLLMEnabled()) {
    return validProblem as unknown as KameokunProblem;
  }

  const systemPrompt = await loadPrompt('generate-problem');
  const judgePrompt = await loadPrompt('judge-quality');

  let feedback: AttemptFeedback | null = null;
  let lastError: LLMError | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      const problem = await attemptGeneration(
        systemPrompt,
        judgePrompt,
        input,
        feedback,
      );
      console.info('[generate-problem] success', { attempt });
      return problem;
    } catch (e) {
      if (e instanceof LLMError) {
        // raw を伏せた diagnostic だけログへ
        console.error('[generate-problem] attempt failed', {
          attempt,
          code: e.code,
          details: redactLLMErrorDetails(e),
        });
        lastError = e;
        if (e.code === 'no_api_key') {
          // 再試行で解決しないので即時失敗
          break;
        }
        feedback = buildFeedbackFromError(attempt, e);
        continue;
      }
      throw e;
    }
  }

  throw (
    lastError ??
    new LLMError('schema_invalid', 'All generation attempts failed')
  );
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const input = validate(InputSchema, body);

    let problem: KameokunProblem;
    try {
      problem = await generateProblem(input);
    } catch (e) {
      if (e instanceof LLMError) {
        // クライアントには汎用エラーのみ返す。details / raw は出さない。
        return NextResponse.json(
          { error: 'generation_failed', code: e.code },
          { status: 502 },
        );
      }
      throw e;
    }

    const session = createSession(problem);

    return NextResponse.json({
      _llm_enabled: isLLMEnabled(),
      session_id: session.id,
      public: session.problem.public,
      characters_overview: session.problem.characters.map(c => ({
        id: c.id,
        name: c.name,
        is_client: c.is_client === true,
      })),
    });
  } catch (e) {
    if (e instanceof BadRequestError) return badRequest(e);
    throw e;
  }
}
