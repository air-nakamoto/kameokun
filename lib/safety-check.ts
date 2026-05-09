// safetyModel をサーバ内部関数として呼び出すレイヤ
//
// 公開APIにせず、対話エンドポイントから内部呼び出しする。
// クライアントから problem や hidden_truth を受け取る経路を作らない。

import type { Session } from './session-store';
import { callLLMJson, isLLMEnabled } from './llm';
import { loadPrompt } from './prompts';
import { SafetyOutputSchema, type SafetyOutput } from './llm-schemas';

const SAFETY_CODES = [
  'must_not_reveal_leak',
  'hidden_truth_core_exposure',
  'solution_preemption',
  'out_of_knowledge_answer',
  'contradiction_with_prior',
  'over_directive_hint',
] as const;

type Code = (typeof SAFETY_CODES)[number];
type Severity = 'high' | 'medium' | 'low';

const SEVERITY_BY_CODE: Record<Code, Severity> = {
  must_not_reveal_leak: 'high',
  hidden_truth_core_exposure: 'high',
  solution_preemption: 'high',
  out_of_knowledge_answer: 'medium',
  contradiction_with_prior: 'medium',
  over_directive_hint: 'low',
};

export interface SafetyResult {
  action: 'pass' | 'soften' | 'regenerate' | 'block';
  violations: Array<{
    code: Code;
    triggered: boolean;
    severity: Severity;
  }>;
  suggested_revision: string;
}

export interface SafetyCheckArgs {
  session: Session;
  speaker_id: string;
  candidate_response: string;
}

function stubResult(): SafetyResult {
  return {
    action: 'pass',
    violations: SAFETY_CODES.map(code => ({
      code,
      triggered: false,
      severity: SEVERITY_BY_CODE[code],
    })),
    suggested_revision: '',
  };
}

export async function safetyCheck(args: SafetyCheckArgs): Promise<SafetyResult> {
  if (!isLLMEnabled()) {
    return stubResult();
  }

  const systemPrompt = await loadPrompt('safety-check');
  const userInput = {
    $RESPONSE: args.candidate_response,
    $PROBLEM: args.session.problem,
    $SPEAKER_ID: args.speaker_id,
    $HISTORY: args.session.history,
    $STAGE: args.session.stage,
  };

  let raw: SafetyOutput;
  try {
    raw = await callLLMJson(
      {
        role: 'safety',
        systemPrompt,
        userMessage: JSON.stringify(userInput),
        temperature: 0.0,
      },
      SafetyOutputSchema,
    );
  } catch {
    // safetyModel が壊れた応答を返した場合は安全側に倒して block
    return {
      action: 'block',
      violations: SAFETY_CODES.map(code => ({
        code,
        triggered: code === 'hidden_truth_core_exposure',
        severity: SEVERITY_BY_CODE[code],
      })),
      suggested_revision: '',
    };
  }

  return {
    action: raw.action,
    violations: raw.violations.map(v => ({
      code: v.code as Code,
      triggered: v.triggered,
      severity: v.severity as Severity,
    })),
    suggested_revision: raw.suggested_revision ?? '',
  };
}
