import { z } from 'zod';
import { NextResponse } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import {
  BadRequestError,
  badRequest,
  parseJsonBody,
  validate,
} from '@/lib/api-utils';
import { getSession, updateSession } from '@/lib/session-store';
import type { Stage } from '@/lib/types';
import { callLLMJson, isLLMEnabled, LLMError } from '@/lib/llm';
import {
  SolveCheckOutputSchema,
  type SolveCheckOutput,
} from '@/lib/llm-schemas';
import { buildDemoSolveCheck } from '@/lib/demo-stub';

type SolveStatus = SolveCheckOutput['status'];

function solveStatusToStage(status: SolveStatus): Stage {
  switch (status) {
    case 'unsolved':
      return 'unsolved';
    case 'stage_1_cleared':
      return 'stage_1';
    case 'stage_2_cleared':
      return 'stage_2';
  }
}

const InputSchema = z.object({
  session_id: z.string().min(1),
  player_answer: z.string().min(1),
});

async function runSolveCheck(
  systemPrompt: string,
  problem: unknown,
  history: unknown,
  playerAnswer: string,
): Promise<SolveCheckOutput> {
  if (!isLLMEnabled()) {
    return buildDemoSolveCheck(playerAnswer);
  }
  return callLLMJson(
    {
      role: 'solve-check',
      systemPrompt,
      userMessage: JSON.stringify({
        $PROBLEM: problem,
        $PLAYER_ANSWER: playerAnswer,
        $HISTORY: history,
      }),
      temperature: 0.0,
    },
    SolveCheckOutputSchema,
  );
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const { session_id, player_answer } = validate(InputSchema, body);
    const systemPrompt = await loadPrompt('solve-check');

    const session = getSession(session_id);
    if (!session) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }

    let result: SolveCheckOutput;
    try {
      result = await runSolveCheck(
        systemPrompt,
        session.problem,
        session.history,
        player_answer,
      );
    } catch (e) {
      if (e instanceof LLMError) {
        return NextResponse.json(
          { error: 'solve_check_llm_error', code: e.code },
          { status: 502 },
        );
      }
      throw e;
    }

    // can_reveal_explanation が status: stage_2_cleared 以外で true になっていたら矛盾。
    // safe側に倒して false にする。
    const canRevealExplanation =
      result.status === 'stage_2_cleared' && result.can_reveal_explanation;

    const newStage = solveStatusToStage(result.status);
    if (newStage !== session.stage) {
      updateSession(session_id, { stage: newStage });
    }

    // 内部フィールド（met/missing/per_requirement/internal_*）はクライアントへ返さない
    return NextResponse.json({
      _llm_enabled: isLLMEnabled(),
      status: result.status,
      can_reveal_explanation: canRevealExplanation,
      player_message: result.player_message,
    });
  } catch (e) {
    if (e instanceof BadRequestError) return badRequest(e);
    throw e;
  }
}
