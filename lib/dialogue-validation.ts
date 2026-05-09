// dialogueModel 出力の構造的整合性チェック
//
// zod のスキーマ検証は形状のみ。LLM はハルシネートして
// 「入力にない fact_id を referenced に入れる」「allowed_answer_types 外の
// answer_type を返す」などをやる可能性がある。
// これらをサーバ側で検出し、汚染されたままセッションへ書き込まないようにする。
//
// 検査項目:
//   1. speaker_id が期待と一致
//   2. referenced_fact_ids ⊆ candidate_disclosures[].fact_id
//   3. disclosed_fact_ids ⊆ referenced_fact_ids
//   4. disclosed_fact_ids ⊆ previously_disclosed: false の候補
//   5. applied_rules.*_indices が配列範囲内
//   6. answer_type ∈ allowed_answer_types

import type { DialogueOutput } from './llm-schemas';
import type { DialogueInputView } from './restricted-views';

export type DialogueValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateDialogueCandidate(
  candidate: DialogueOutput,
  dialogueInput: DialogueInputView,
  expectedSpeakerId: string,
): DialogueValidationResult {
  if (candidate.speaker_id !== expectedSpeakerId) {
    return {
      ok: false,
      reason: `speaker_id mismatch: got "${candidate.speaker_id}", expected "${expectedSpeakerId}"`,
    };
  }

  const candidateFactIds = new Set(
    dialogueInput.candidate_disclosures.map(d => d.fact_id),
  );
  const newDisclosableIds = new Set(
    dialogueInput.candidate_disclosures
      .filter(d => !d.previously_disclosed)
      .map(d => d.fact_id),
  );

  for (const id of candidate.referenced_fact_ids) {
    if (!candidateFactIds.has(id)) {
      return {
        ok: false,
        reason: `referenced_fact_ids contains id not in candidate_disclosures: "${id}"`,
      };
    }
  }

  const referencedSet = new Set(candidate.referenced_fact_ids);
  for (const id of candidate.disclosed_fact_ids) {
    if (!referencedSet.has(id)) {
      return {
        ok: false,
        reason: `disclosed_fact_ids must be subset of referenced_fact_ids; missing: "${id}"`,
      };
    }
  }

  for (const id of candidate.disclosed_fact_ids) {
    if (!newDisclosableIds.has(id)) {
      return {
        ok: false,
        reason: `disclosed_fact_ids contains already-disclosed or non-candidate id: "${id}"`,
      };
    }
  }

  const revealRulesLen = dialogueInput.stage_allowed_reveal_rules.length;
  for (const idx of candidate.applied_rules.reveal_rule_indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= revealRulesLen) {
      return {
        ok: false,
        reason: `applied_rules.reveal_rule_indices out of range: ${idx} (length=${revealRulesLen})`,
      };
    }
  }
  const refusalRulesLen = dialogueInput.applicable_refusal_rules.length;
  for (const idx of candidate.applied_rules.refusal_rule_indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= refusalRulesLen) {
      return {
        ok: false,
        reason: `applied_rules.refusal_rule_indices out of range: ${idx} (length=${refusalRulesLen})`,
      };
    }
  }

  if (!dialogueInput.allowed_answer_types.includes(candidate.answer_type)) {
    return {
      ok: false,
      reason: `answer_type "${candidate.answer_type}" not in allowed_answer_types`,
    };
  }

  return { ok: true };
}
