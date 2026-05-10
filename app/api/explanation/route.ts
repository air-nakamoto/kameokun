import { z } from 'zod';
import { NextResponse } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import {
  BadRequestError,
  badRequest,
  parseJsonBody,
  validate,
} from '@/lib/api-utils';
import { getSession } from '@/lib/session-store';
import {
  callLLMJson,
  isLLMEnabled,
  LLMError,
  redactLLMErrorDetails,
} from '@/lib/llm';
import {
  ExplanationOutputSchema,
  type ExplanationOutput,
} from '@/lib/llm-schemas';
import { buildDemoExplanation } from '@/lib/demo-stub';
import type { Session } from '@/lib/session-store';

const InputSchema = z.object({
  session_id: z.string().min(1),
});

function buildLLMInput(session: Session) {
  // 解決済みなので、感想戦LLMには真相一式を渡してよい
  // （対話とは別チャネル、出力もネタばらし許可）
  return {
    public_intro: session.problem.public.intro,
    characters: session.problem.characters.map(c => ({
      id: c.id,
      name: c.name,
      is_client: c.is_client === true,
    })),
    truth: {
      hidden_truth: session.problem.truth.hidden_truth,
      two_stage_structure: session.problem.truth.two_stage_structure,
      objective_facts: session.problem.truth.objective_facts.map(f => ({
        id: f.id,
        fact: f.fact,
      })),
    },
    history: session.history,
    disclosed_fact_ids: session.disclosed_fact_ids,
  };
}

async function runExplanation(
  systemPrompt: string,
  session: Session,
): Promise<ExplanationOutput> {
  if (!isLLMEnabled()) {
    return buildDemoExplanation(session.problem, session.disclosed_fact_ids);
  }
  return callLLMJson(
    {
      role: 'explanation',
      systemPrompt,
      userMessage: JSON.stringify(buildLLMInput(session)),
      temperature: 0.6,
      maxTokens: 2000,
    },
    ExplanationOutputSchema,
  );
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const { session_id } = validate(InputSchema, body);
    const systemPrompt = await loadPrompt('explanation');

    const session = getSession(session_id);
    if (!session) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }

    if (session.stage !== 'stage_2') {
      // 解決前に呼び出されるとネタバレになるためロック
      return NextResponse.json(
        { error: 'explanation_locked' },
        { status: 403 },
      );
    }

    let result: ExplanationOutput;
    try {
      result = await runExplanation(systemPrompt, session);
    } catch (e) {
      if (e instanceof LLMError) {
        console.error('[explanation] LLMError', {
          code: e.code,
          message: e.message,
          details: redactLLMErrorDetails(e),
        });
        return NextResponse.json(
          { error: 'explanation_llm_error', code: e.code },
          { status: 502 },
        );
      }
      throw e;
    }

    return NextResponse.json({
      _llm_enabled: isLLMEnabled(),
      summary: result.summary,
      stage_breakdown: result.stage_breakdown,
      learning_points: result.learning_points,
      missed_facts: result.missed_facts,
    });
  } catch (e) {
    if (e instanceof BadRequestError) return badRequest(e);
    throw e;
  }
}
