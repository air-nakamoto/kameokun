// LLM出力の zod スキーマ
// callLLMJson(args, schema) で LLM 出力の型安全性を担保する。

import { z } from 'zod';

const AnswerType = z.enum(['yes', 'no', 'unknown', 'partial', 'freeform']);
const Stage = z.enum(['unsolved', 'stage_1', 'stage_2']);

export const DialogueOutputSchema = z.object({
  speaker_id: z.string(),
  response: z.string(),
  answer_type: AnswerType,
  disclosed_fact_ids: z.array(z.string()),
  referenced_fact_ids: z.array(z.string()),
  applied_rules: z.object({
    reveal_rule_indices: z.array(z.number().int()),
    refusal_rule_indices: z.array(z.number().int()),
  }),
});
export type DialogueOutput = z.infer<typeof DialogueOutputSchema>;

const SAFETY_CODES = [
  'must_not_reveal_leak',
  'hidden_truth_core_exposure',
  'solution_preemption',
  'out_of_knowledge_answer',
  'contradiction_with_prior',
  'over_directive_hint',
] as const;

export const SafetyOutputSchema = z.object({
  safety_model: z.string().optional(),
  checked_at: z.string().optional(),
  speaker_id: z.string(),
  stage: Stage,
  violations: z.array(
    z.object({
      code: z.enum(SAFETY_CODES),
      triggered: z.boolean(),
      severity: z.enum(['high', 'medium', 'low']),
      evidence_span: z
        .union([z.null(), z.object({ start: z.number().int(), end: z.number().int() })])
        .optional(),
      evidence_in_response: z.string().optional(),
      reference_path: z.string().optional(),
      note: z.string().optional(),
    }),
  ),
  action: z.enum(['pass', 'soften', 'regenerate', 'block']),
  rationale: z.string().optional(),
  suggested_revision: z.string().optional(),
});
export type SafetyOutput = z.infer<typeof SafetyOutputSchema>;

export const SolveStatus = z.enum(['unsolved', 'stage_1_cleared', 'stage_2_cleared']);

export const SolveCheckOutputSchema = z.object({
  judge_model: z.string().optional(),
  checked_at: z.string().optional(),
  status: SolveStatus,
  minimum_to_clear_satisfied: z.boolean(),
  met_requirement_ids: z.array(z.string()),
  missing_requirement_ids: z.array(z.string()),
  per_requirement: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['truth', 'solution']),
      met: z.boolean(),
      confidence: z.enum(['low', 'medium', 'high']),
      internal_note: z.string().optional(),
    }),
  ),
  confidence: z.enum(['low', 'medium', 'high']),
  can_reveal_explanation: z.boolean(),
  player_message: z.string(),
  internal_summary: z.string().optional(),
});
export type SolveCheckOutput = z.infer<typeof SolveCheckOutputSchema>;

const FAIL_CODES = [
  'solvable_without_truth',
  'solution_not_unique',
  'unnatural_concealment',
  'unreachable_truth',
  'charm_relies_on_oddity_only',
  'stage1_stage2_too_close',
  'truth_lacks_objective_anchor',
  'solution_too_abstract',
  'pattern_collision_with_samples',
] as const;

export const JudgeOutputSchema = z.object({
  judge_model: z.string().optional(),
  judge_run_at: z.string().optional(),
  structural_invalid: z.boolean(),
  structural_errors: z.array(z.string()),
  fail_conditions: z.array(
    z.object({
      code: z.enum(FAIL_CODES),
      triggered: z.boolean(),
      note: z.string().optional(),
    }),
  ),
  passed: z.boolean(),
  rationale: z.string().optional(),
  regenerate_focus: z.array(z.string()),
});
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export const NakamotoHintOutputSchema = z.object({
  narration: z.string(),
  important_points: z.array(z.string()).min(1).max(5),
  underexplored_points: z.array(z.string()).min(1).max(3),
  suggested_next_questions: z.array(z.string()).min(1).max(3),
});
export type NakamotoHintOutput = z.infer<typeof NakamotoHintOutputSchema>;
