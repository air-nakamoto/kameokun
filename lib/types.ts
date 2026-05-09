// 亀夫君問題JSONの TypeScript 型定義
// schemas/problem.schema.json v1.0.0 の構造を写す

export type AnswerType = 'yes' | 'no' | 'unknown' | 'partial' | 'freeform';
export type Stage = 'unsolved' | 'stage_1' | 'stage_2';
export type Difficulty = 'beginner' | 'standard' | 'advanced';
export type Tone = 'light' | 'normal' | 'heavy';

export interface Character {
  id: string;
  name: string;
  role: string;
  personality: string;
  speech_style?: string;
  known_facts: string[];
  unknown_facts: string[];
  must_not_reveal_directly?: string[];
  is_client?: boolean;
}

export interface ObjectiveFact {
  id: string;
  fact: string;
  verifiable_by: string[];
}

export interface SubjectiveBelief {
  character_id: string;
  belief: string;
  is_misperception?: boolean;
}

export interface RevealRule {
  trigger: string;
  content: string;
  stage_required?: 'any' | 'stage_1' | 'stage_2';
}

export interface RefusalRule {
  pattern: string;
  response_style: string;
}

export interface Requirement {
  id: string;
  description: string;
  anchored_facts?: string[];
}

export interface KameokunProblem {
  id: string;
  schema_version: string;
  public: {
    title: string;
    intro: string;
    rules: string;
    player_visible_tags: {
      estimated_minutes: number;
      difficulty: Difficulty;
    };
  };
  internal: {
    situation_type: string;
    tone: Tone;
    charm_pattern: string;
    misdirection: string;
    truth_reveal: string;
    solution_shape: string;
    resolution_pattern?: string;
  };
  characters: Character[];
  truth: {
    hidden_truth: string;
    objective_facts: ObjectiveFact[];
    subjective_beliefs: SubjectiveBelief[];
    misunderstandings: string[];
    two_stage_structure: {
      stage_1_truth: string;
      stage_2_solution: string;
    };
  };
  answer_policy: {
    default_style: 'character_roleplay';
    allowed_answer_types: AnswerType[];
    reveal_rules: RevealRule[];
    refusal_rules: RefusalRule[];
    consistency_rules?: string[];
  };
  solution_criteria: {
    truth_requirements: Requirement[];
    solution_requirements: Requirement[];
    minimum_to_clear: string[];
  };
  quality_gate: {
    passed: boolean;
    fail_conditions: Array<{ code: string; triggered: boolean; note?: string }>;
  };
}
