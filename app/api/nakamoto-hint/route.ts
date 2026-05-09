import { z } from 'zod';
import { NextResponse } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import {
  BadRequestError,
  badRequest,
  parseJsonBody,
  validate,
  stubResponse,
} from '@/lib/api-utils';
import { getSession } from '@/lib/session-store';
import { buildNakamotoHintInput } from '@/lib/restricted-views';
import { callLLMJson, isLLMEnabled, LLMError, redactLLMErrorDetails } from '@/lib/llm';
import { NakamotoHintOutputSchema, type NakamotoHintOutput } from '@/lib/llm-schemas';

const InputSchema = z.object({
  session_id: z.string().min(1),
});

function buildStubHint(): NakamotoHintOutput {
  return {
    narration:
      '🐢「ここまでよく頑張ってますね〜！情報はだんだん集まってきてる感じがしますよ」',
    important_points: [
      '（スタブ）まだ開示済みの情報はありません',
    ],
    underexplored_points: [
      '（スタブ）他のキャラクターにも話を聞いてみましょう',
    ],
    suggested_next_questions: [
      '（スタブ）「最近何か変わったことはありますか？」と聞いてみるのはどうですか？',
    ],
  };
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const { session_id } = validate(InputSchema, body);
    const systemPrompt = await loadPrompt('nakamoto-hint');

    const session = getSession(session_id);
    if (!session) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }

    // 会話履歴が空の場合はヒントを出す意味がない
    if (session.history.length === 0) {
      return NextResponse.json(
        { error: 'no_history', message: 'まだ会話が始まっていません。質問してからヒントを使ってください。' },
        { status: 400 },
      );
    }

    const hintInput = buildNakamotoHintInput(session);

    if (!isLLMEnabled()) {
      const stub = buildStubHint();
      return stubResponse({ ...stub }, 'nakamoto-hint');
    }

    let hint: NakamotoHintOutput;
    try {
      hint = await callLLMJson(
        {
          role: 'nakamoto-hint',
          systemPrompt,
          userMessage: JSON.stringify(hintInput),
          temperature: 0.7,
          maxTokens: 2048,
        },
        NakamotoHintOutputSchema,
      );
    } catch (e) {
      if (e instanceof LLMError) {
        console.error('[nakamoto-hint] LLMError', {
          code: e.code,
          message: e.message,
          details: redactLLMErrorDetails(e),
        });
        return NextResponse.json(
          { error: 'nakamoto_hint_llm_error', code: e.code },
          { status: 502 },
        );
      }
      throw e;
    }

    // updated_at はgetSession内でタッチ済みなので追加の updateSession は不要

    return NextResponse.json({
      _llm_enabled: true,
      narration: hint.narration,
      important_points: hint.important_points,
      underexplored_points: hint.underexplored_points,
      suggested_next_questions: hint.suggested_next_questions,
    });
  } catch (e) {
    if (e instanceof BadRequestError) return badRequest(e);
    throw e;
  }
}
