import type {
  DialogueOutput,
  ExplanationOutput,
  SolveCheckOutput,
} from './llm-schemas';
import type { DialogueInputView } from './restricted-views';
import type { Session } from './session-store';
import type { KameokunProblem, Stage } from './types';

function includesAny(text: string, words: string[]): boolean {
  return words.some(w => text.includes(w));
}

function hasInHistory(session: Session, words: string[]): boolean {
  const text = session.history.map(h => h.content).join('\n');
  return includesAny(text, words);
}

function output(
  session: Session,
  speakerId: string,
  response: string,
  answerType: DialogueOutput['answer_type'] = 'freeform',
  factIds: string[] = [],
): DialogueOutput {
  const disclosedSet = new Set(session.disclosed_fact_ids);
  const newlyDisclosed = factIds.filter(id => !disclosedSet.has(id));
  return {
    speaker_id: speakerId,
    response,
    answer_type: answerType,
    disclosed_fact_ids: newlyDisclosed,
    referenced_fact_ids: factIds,
    applied_rules: { reveal_rule_indices: [], refusal_rule_indices: [] },
  };
}

export interface DemoDialogueResult {
  candidate: DialogueOutput;
  nextStage?: Stage;
}

export function buildDemoDialogueCandidate(
  session: Session,
  dialogueInput: DialogueInputView,
): DemoDialogueResult {
  const speakerId = dialogueInput.speaker.id;
  const msg = dialogueInput.player_message.toLowerCase();
  const raw = dialogueInput.player_message;

  if (speakerId === 'tanaka') {
    if (includesAny(raw, ['付箋', 'ふせん', '字', '先輩', '誰'])) {
      return {
        candidate: output(
          session,
          speakerId,
          'ああ、その付箋の字なら、たぶん先輩の字だと思います。先輩って真面目だけど不器用なんですよね。でも、本当はかなり後輩思いな人ですよ。',
          'freeform',
          ['fact_sticky_notes', 'fact_tanaka_knows_senpai'],
        ),
      };
    }
    return {
        candidate: output(
        session,
        speakerId,
        '先輩のことですか？ 真面目で不器用だけど、悪い人ではないですよ。健太くんのことも気にかけていると思います。',
        'freeform',
        ['fact_tanaka_knows_senpai'],
      ),
    };
  }

  if (speakerId === 'yamada') {
    if (includesAny(raw, ['先輩', '相談', '付箋', 'ふせん', '後輩', '接し方'])) {
      return {
        candidate: output(
          session,
          speakerId,
          '先輩はね、後輩への接し方をかなり気にしていました。「返事がそっけなくて怖がられているかもしれない」と相談に来たこともあります。チャットだけでは伝わりにくいから、別の形でも気持ちを示せないか考えていたようですよ。',
          'freeform',
          ['fact_senpai_consulted'],
        ),
      };
    }
    return {
        candidate: output(
        session,
        speakerId,
        '先輩は仕事には厳しいですが、後輩を突き放したい人ではありません。少し不器用なだけだと思いますよ。',
        'freeform',
        ['fact_senpai_consulted'],
      ),
    };
  }

  if (
    session.stage === 'stage_1' &&
    (hasInHistory(session, ['後輩思い', '接し方', 'チャットだけ']) ||
      includesAny(raw, ['ありがとう', '感謝', '歩み寄', '話して', '宝探し', 'きっかけ']))
  ) {
    return {
        candidate: output(
          session,
          speakerId,
        '先輩も悩んでいたんですね...。なんだか、怖い人というより、不器用だけど一生懸命歩み寄ろうとしてくれていたのかもしれません。僕からも「付箋、気づいていました。宝探しみたいで面白かったです。ありがとうございます」って伝えてみたいです。',
        'freeform',
      ),
      nextStage: 'stage_2',
    };
  }

  if (includesAny(raw, ['付箋', 'ふせん', '貼', '机', 'イラスト', '絵'])) {
    return {
        candidate: output(
          session,
          speakerId,
        '付箋には「了解」とか「確認した」とか、一言だけ書いてあります。その横に小さなイラストもあるんですけど、かなり下手で何を描いているのか分からなくて...。しかも、机の裏側とかパソコンの後ろみたいな、見つけにくい場所に貼ってあるんです。',
        'freeform',
        ['fact_sticky_notes'],
      ),
    };
  }

  if (includesAny(raw, ['メール', '報告', '普段', '連絡', 'どんな', '書いて'])) {
    return {
        candidate: output(
          session,
          speakerId,
        'いつもは、起きたことを順番に詳しく書くようにしています。「まず確認しました、次に調べました、その結果こうでした」みたいな感じです。自分では丁寧に書いているつもりなんですが、先輩からは「で、結局どうしてほしいの？」と返ってきてしまいます。',
        'freeform',
        ['fact_report_timeseries', 'fact_senpai_request'],
      ),
    };
  }

  if (includesAny(raw, ['結論', '依頼', 'お願い', '先に', '冒頭', '順番', 'どうしてほしい'])) {
    return {
        candidate: output(
          session,
          speakerId,
        'あ...！そうかもしれません。僕は調べた順番を伝えることばかり考えていました。でも先輩からすると、最初に「何が分かったのか」と「何をお願いしたいのか」が知りたかったのかもしれないです。報告の書き方は少し見えてきました。...ただ、実はもう一つだけ気になっていることがあるんです。最近、僕の机の見つけにくい場所に、時々付箋が貼られているんです。',
        'freeform',
        ['fact_report_need_action', 'fact_sticky_notes'],
      ),
      nextStage: 'stage_1',
    };
  }

  if (includesAny(raw, ['先輩', 'いい人', '怖い', 'そっけない', '尊敬'])) {
    return {
        candidate: output(
          session,
          speakerId,
        '先輩は仕事がすごくできる方で、尊敬しています。ただ、チャットの返事がいつも短くて、「了解」とか「要点まとめて」とか、ちょっとそっけなく感じてしまうんです。',
        'freeform',
        ['fact_senpai_request'],
      ),
    };
  }

  if (includesAny(raw, ['課長', '上司', '山田'])) {
    return {
        candidate: output(
          session,
          speakerId,
        '山田課長なら、先輩のことをよく見ていると思います。悪い相談ではなく、いつもお世話になっているという話なら聞いてみやすいかもしれません。',
        'freeform',
      ),
    };
  }

  if (includesAny(raw, ['田中', '同僚', '隣'])) {
    return {
        candidate: output(
          session,
          speakerId,
        '隣の席の田中さんなら、先輩のことを少し知っているかもしれません。僕からも聞いてみたいです。',
        'freeform',
      ),
    };
  }

  if (msg.includes('こんにちは') || msg.includes('はじめまして')) {
    return {
        candidate: output(
          session,
          speakerId,
        'こんにちは、話を聞いてくださってありがとうございます。僕、仕事の報告がうまく伝わらなくて困っているんです。先輩に何度も「要点がわからない」と言われてしまって...。',
        'freeform',
      ),
    };
  }

  return {
      candidate: output(
        session,
        speakerId,
      'ええと...そこはまだ自分でも整理できていないかもしれません。報告の書き方や、先輩とのやり取りについてなら、もう少し具体的にお話しできます。',
      'unknown',
    ),
  };
}

export function buildDemoSolveCheck(
  playerAnswer: string,
): SolveCheckOutput {
  const a = playerAnswer.toLowerCase();
  const hasReport =
    includesAny(playerAnswer, ['結論', '依頼', 'お願い', '先に', '冒頭']) &&
    includesAny(playerAnswer, ['経緯', '時系列', '順番', '後']);
  const hasSenpaiTruth =
    includesAny(playerAnswer, ['付箋', 'ふせん', '先輩']) &&
    includesAny(playerAnswer, ['不器用', '後輩思い', '悩ん', '歩み寄', '優し']);
  const hasWalkToward =
    includesAny(playerAnswer, ['ありがとう', '感謝', '伝える', '話す', '歩み寄', 'きっかけ']);

  if (hasReport && hasSenpaiTruth && hasWalkToward) {
    return {
      status: 'stage_2_cleared',
      minimum_to_clear_satisfied: true,
      met_requirement_ids: [
        'truth_report_order',
        'truth_senpai_kindness',
        'solution_report_structure',
        'solution_walk_toward_senpai',
      ],
      missing_requirement_ids: [],
      per_requirement: [],
      confidence: 'high',
      can_reveal_explanation: true,
      player_message:
        '解決おめでとうございます。報告の構造と、先輩との関係の見方、その両方に届いています。',
    };
  }

  if (hasReport) {
    return {
      status: 'stage_1_cleared',
      minimum_to_clear_satisfied: false,
      met_requirement_ids: ['truth_report_order', 'solution_report_structure'],
      missing_requirement_ids: ['truth_senpai_kindness', 'solution_walk_toward_senpai'],
      per_requirement: [],
      confidence: 'medium',
      can_reveal_explanation: false,
      player_message:
        '真相のかなり大事な部分には届いています。ただ、相談者が次にどう動けばいいかは、まだ少し足りません。',
    };
  }

  if (a.includes('わかりません') || a.includes('分から')) {
    return {
      status: 'unsolved',
      minimum_to_clear_satisfied: false,
      met_requirement_ids: [],
      missing_requirement_ids: [
        'truth_report_order',
        'truth_senpai_kindness',
        'solution_report_structure',
        'solution_walk_toward_senpai',
      ],
      per_requirement: [],
      confidence: 'high',
      can_reveal_explanation: false,
      player_message:
        'まだ大事な要素に届いていなさそうです。もう少し会話を続けると、見えてくるものがあるかもしれません。',
    };
  }

  return {
    status: 'unsolved',
    minimum_to_clear_satisfied: false,
    met_requirement_ids: [],
    missing_requirement_ids: [
      'truth_report_order',
      'truth_senpai_kindness',
      'solution_report_structure',
      'solution_walk_toward_senpai',
    ],
    per_requirement: [],
    confidence: 'medium',
    can_reveal_explanation: false,
    player_message:
      'いくつか良い視点はありますが、まだ解決には届いていません。もう少し会話で情報を集めてみてください。',
  };
}

export function buildDemoExplanation(
  problem: KameokunProblem,
  disclosedFactIds: string[],
): ExplanationOutput {
  const disclosedSet = new Set(disclosedFactIds);
  const factById = new Map(
    problem.truth.objective_facts.map(f => [f.id, f.fact] as const),
  );
  // 重要事実候補: stage_1_truth/stage_2_solution に紐づくID（demo-problem.json では
  // truth_requirements.anchored_facts に列挙されている）
  const anchorIds = new Set<string>();
  for (const req of problem.solution_criteria.truth_requirements) {
    for (const fid of req.anchored_facts ?? []) anchorIds.add(fid);
  }
  const missed: string[] = [];
  for (const fid of anchorIds) {
    if (!disclosedSet.has(fid)) {
      const fact = factById.get(fid);
      if (fact) missed.push(`${fact}、というポイントは触れずじまいやったかも`);
    }
    if (missed.length >= 3) break;
  }

  return {
    summary:
      '🐢「いやぁ、みごと解決ですね！報告がうまく伝わらなかった話と、先輩の付箋に込められた歩み寄り、その両方をちゃんと結びつけられたのは大きいですよ。健太くんも、明日からはもう少し肩の力を抜いて先輩と話せそうな気がしますね〜」',
    stage_breakdown: {
      stage_1_truth: problem.truth.two_stage_structure.stage_1_truth,
      stage_2_solution: problem.truth.two_stage_structure.stage_2_solution,
    },
    learning_points: [
      '報告は「経緯から書く」より「相手にしてほしい行動から書く」方が伝わりやすいケースが多いです',
      '一見そっけない相手にも、不器用なりの歩み寄りが隠れていることがあります',
      '思い込みを一旦疑って、別の角度から状況を見直す視点が水平思考のコアです',
    ],
    missed_facts: missed,
  };
}
