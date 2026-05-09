import { z } from 'zod';
import { NextResponse } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import {
  BadRequestError,
  badRequest,
  parseJsonBody,
  validate,
} from '@/lib/api-utils';
import { getSession, updateSession, type Session } from '@/lib/session-store';
import { buildDialogueInput } from '@/lib/restricted-views';
import { safetyCheck } from '@/lib/safety-check';
import { callLLMJson, isLLMEnabled, LLMError, redactLLMErrorDetails } from '@/lib/llm';
import { DialogueOutputSchema, type DialogueOutput } from '@/lib/llm-schemas';
import { validateDialogueCandidate } from '@/lib/dialogue-validation';
import { buildDemoDialogueCandidate } from '@/lib/demo-stub';
import type { Stage } from '@/lib/types';

const InputSchema = z.object({
  session_id: z.string().min(1),
  speaker_id: z.string().optional(),
  player_message: z.string().min(1),
});

interface DialoguePipelineResult {
  candidate: DialogueOutput;
  nextStage?: Stage;
}

async function runDialogueModel(
  systemPrompt: string,
  dialogueInput: ReturnType<typeof buildDialogueInput>,
  fallbackSpeakerId: string,
  session: Session,
): Promise<DialoguePipelineResult> {
  if (!isLLMEnabled()) {
    return buildDemoDialogueCandidate(session, dialogueInput);
  }
  const candidate = await callLLMJson(
    {
      role: 'dialogue',
      systemPrompt,
      userMessage: JSON.stringify(dialogueInput),
      temperature: 0.6,
    },
    DialogueOutputSchema,
  );
  return { candidate };
}

export async function POST(req: Request) {
  try {
    const body = await parseJsonBody(req);
    const { session_id, speaker_id, player_message } = validate(InputSchema, body);
    const systemPrompt = await loadPrompt('dialogue-character');

    const session = getSession(session_id);
    if (!session) {
      return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
    }

    const targetId =
      speaker_id ?? session.problem.characters.find(c => c.is_client)?.id;
    if (!targetId) {
      return NextResponse.json({ error: 'no_speaker_available' }, { status: 400 });
    }
    if (!session.problem.characters.some(c => c.id === targetId)) {
      throw new BadRequestError('unknown_speaker', `Speaker not found: ${targetId}`);
    }

    const dialogueInput = buildDialogueInput(session, targetId, player_message);

    let pipeline: DialoguePipelineResult;
    try {
      pipeline = await runDialogueModel(systemPrompt, dialogueInput, targetId, session);
    } catch (e) {
      if (e instanceof LLMError) {
        console.error('[dialogue] LLMError', {
          code: e.code,
          message: e.message,
          details: redactLLMErrorDetails(e),
        });
        return NextResponse.json(
          { error: 'dialogue_llm_error', code: e.code },
          { status: 502 },
        );
      }
      throw e;
    }
    const { candidate } = pipeline;

    // dialogueModel 出力の構造的整合性チェック
    // （zod は形状のみ、ここで参照整合性・列挙範囲・順序契約を検証）
    const candidateValidation = validateDialogueCandidate(
      candidate,
      dialogueInput,
      targetId,
    );
    if (!candidateValidation.ok) {
      console.error('[dialogue] candidate validation failed', {
        reason: candidateValidation.reason,
      });
      return NextResponse.json(
        { error: 'dialogue_candidate_invalid' },
        { status: 502 },
      );
    }

    const safety = await safetyCheck({
      session,
      speaker_id: targetId,
      candidate_response: candidate.response,
    });

    // action 分岐:
    //   pass       → 候補をそのままプレイヤーへ
    //   soften     → MVPでは regenerate と同じ扱い（差し替え時の整合維持が複雑なため）
    //   regenerate → 502。本実装ではdialogueModelの再試行ループへ
    //   block      → 502。プレイヤーには届けない
    let finalResponse: string;
    switch (safety.action) {
      case 'pass':
        finalResponse = candidate.response;
        break;
      case 'soften':
      case 'regenerate':
        return NextResponse.json(
          { error: 'safety_regenerate_required' },
          { status: 502 },
        );
      case 'block':
        return NextResponse.json({ error: 'safety_block' }, { status: 502 });
    }

    // 開示済 fact は disclosed_fact_ids（新規開示）のみマージ
    const newDisclosed = candidate.disclosed_fact_ids;

    updateSession(session_id, {
      stage: pipeline.nextStage ?? session.stage,
      history: [
        ...session.history,
        { role: 'player', content: player_message },
        { role: 'character', speaker_id: targetId, content: finalResponse },
      ],
      disclosed_fact_ids: Array.from(
        new Set([...session.disclosed_fact_ids, ...newDisclosed]),
      ),
    });

    return NextResponse.json({
      _llm_enabled: isLLMEnabled(),
      speaker_id: candidate.speaker_id || targetId,
      response: finalResponse,
      answer_type: candidate.answer_type,
    });
  } catch (e) {
    if (e instanceof BadRequestError) return badRequest(e);
    throw e;
  }
}
