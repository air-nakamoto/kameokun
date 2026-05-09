// 対話LLMに渡す「制限ビュー」をサーバ側で組み立てる
//
// 真相JSON 全体は LLM に渡さず、当該応答に必要な範囲のみを切り出す。
// hidden_truth / 他キャラの subjective_beliefs / solution_criteria /
// two_stage_structure は dialogueModel に届かない設計。
//
// 命名方針:
//   candidate_disclosures        … 話者が「開示しうる候補」。LLM が最終的に
//                                   今回の質問に必要なものだけを選んで開示する
//   stage_allowed_reveal_rules   … 現在ステージで開示が許される reveal_rules。
//                                   trigger 評価はまだ済んでおらず、LLM 側で
//                                   trigger との一致を判断する
//
// TODO: candidate_disclosures は将来 player_message との簡易キーワードフィルタを
//       入れて絞ると安全度が上がる。現状は話者の verifiable 全件をそのまま渡す。

import type { Session } from './session-store';
import type { AnswerType, RefusalRule, RevealRule, Stage } from './types';

export interface DialogueInputView {
  speaker: {
    id: string;
    name: string;
    role: string;
    personality: string;
    speech_style?: string;
    known_facts: string[];
    unknown_facts: string[];
    must_not_reveal_directly: string[];
    own_subjective_beliefs: string[];
  };
  scene_context: {
    public_intro: string;
    stage: Stage;
    consistency_rules: string[];
  };
  candidate_disclosures: Array<{
    fact_id: string;
    fact: string;
    previously_disclosed: boolean;
  }>;
  stage_allowed_reveal_rules: RevealRule[];
  applicable_refusal_rules: RefusalRule[];
  allowed_answer_types: AnswerType[];
  history: Session['history'];
  player_message: string;
}

function isStageReached(reached: Stage, required: 'any' | 'stage_1' | 'stage_2'): boolean {
  if (required === 'any') return true;
  if (required === 'stage_1') return reached === 'stage_1' || reached === 'stage_2';
  return reached === 'stage_2';
}

export function buildDialogueInput(
  session: Session,
  speakerId: string,
  playerMessage: string,
): DialogueInputView {
  const speaker = session.problem.characters.find(c => c.id === speakerId);
  if (!speaker) {
    throw new Error(`Unknown speaker: ${speakerId}`);
  }

  const ownBeliefs = session.problem.truth.subjective_beliefs
    .filter(b => b.character_id === speakerId)
    .map(b => b.belief);

  const candidateDisclosures = session.problem.truth.objective_facts
    .filter(f => f.verifiable_by.includes(speakerId))
    .map(f => ({
      fact_id: f.id,
      fact: f.fact,
      previously_disclosed: session.disclosed_fact_ids.includes(f.id),
    }));

  const stageAllowedRevealRules = session.problem.answer_policy.reveal_rules.filter(r =>
    isStageReached(session.stage, r.stage_required ?? 'any'),
  );

  return {
    speaker: {
      id: speaker.id,
      name: speaker.name,
      role: speaker.role,
      personality: speaker.personality,
      speech_style: speaker.speech_style,
      known_facts: speaker.known_facts,
      unknown_facts: speaker.unknown_facts,
      must_not_reveal_directly: speaker.must_not_reveal_directly ?? [],
      own_subjective_beliefs: ownBeliefs,
    },
    scene_context: {
      public_intro: session.problem.public.intro,
      stage: session.stage,
      consistency_rules: session.problem.answer_policy.consistency_rules ?? [],
    },
    candidate_disclosures: candidateDisclosures,
    stage_allowed_reveal_rules: stageAllowedRevealRules,
    applicable_refusal_rules: session.problem.answer_policy.refusal_rules,
    allowed_answer_types: session.problem.answer_policy.allowed_answer_types,
    history: session.history,
    player_message: playerMessage,
  };
}

// ===== 中本ヒント用の制限ビュー =====
// hidden_truth / two_stage_structure の具体的語句は渡さない。
// 探索状況のメタ情報（開示済み率、会話済みキャラ等）だけ渡し、
// LLM が「まだ深掘りできる方向」を示唆できる程度にする。

export interface NakamotoHintInputView {
  public_intro: string;
  stage: Stage;
  characters: Array<{ id: string; name: string; is_client: boolean }>;
  history: Session['history'];
  disclosed_fact_ids: string[];
  total_objective_fact_count: number;
  hint_context: {
    important_fact_ids_disclosed: string[];
    important_fact_count: number;
    exploration_coverage: number;
    talked_to_character_ids: string[];
    all_character_ids: string[];
  };
}

export function buildNakamotoHintInput(
  session: Session,
): NakamotoHintInputView {
  const allFactIds = session.problem.truth.objective_facts.map(f => f.id);
  const disclosedSet = new Set(session.disclosed_fact_ids);

  // 探索カバレッジ = 開示済みファクト数 / 全ファクト数
  const coverage =
    allFactIds.length > 0
      ? disclosedSet.size / allFactIds.length
      : 0;

  // 会話済みキャラを history から抽出
  const talkedTo = new Set<string>();
  for (const entry of session.history) {
    if (entry.role === 'character' && entry.speaker_id) {
      talkedTo.add(entry.speaker_id);
    }
  }

  const allCharacterIds = session.problem.characters.map(c => c.id);

  // 「重要な事実」= verifiable_by が複数キャラにまたがる or is_client のキャラが検証可能な事実
  const clientIds = new Set(
    session.problem.characters.filter(c => c.is_client).map(c => c.id),
  );
  const importantFacts = session.problem.truth.objective_facts.filter(
    f =>
      f.verifiable_by.length >= 2 ||
      f.verifiable_by.some(v => clientIds.has(v)),
  );
  const importantDisclosed = importantFacts
    .filter(f => disclosedSet.has(f.id))
    .map(f => f.id);

  return {
    public_intro: session.problem.public.intro,
    stage: session.stage,
    characters: session.problem.characters.map(c => ({
      id: c.id,
      name: c.name,
      is_client: c.is_client ?? false,
    })),
    history: session.history,
    disclosed_fact_ids: session.disclosed_fact_ids,
    total_objective_fact_count: allFactIds.length,
    hint_context: {
      important_fact_ids_disclosed: importantDisclosed,
      important_fact_count: importantFacts.length,
      exploration_coverage: Math.round(coverage * 100) / 100,
      talked_to_character_ids: [...talkedTo],
      all_character_ids: allCharacterIds,
    },
  };
}
