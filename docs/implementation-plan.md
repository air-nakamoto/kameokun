# 実装計画と課題一覧

このファイルは、Kameokun MVPを本番利用に近づけるための残課題と実装順序をまとめたものです。

## 現在の到達点

- Next.js App RouterでMVP画面/APIが動く
- スタブモードではデモ問題「伝わらない報告」を出題できる
- デモ問題では、最低限以下の流れを確認できる
  - 問題開始
  - 健太への質問
  - 報告順の気づき
  - 付箋の謎
  - 田中さん/山田課長への聞き込み
  - 解答判定
- 実LLM接続層は実装済み
- 実LLMでの通し検証は未実施

## 優先度P0: まず確認すること

### 1. スタブデモの手動検証

目的: LLMなしでゲームの導線が最低限成立するか確認する。

確認手順:

1. `KAMEO_USE_STUBS=true npm run dev`
2. `http://localhost:3000` を開く
3. 「開始」を押す
4. 健太に報告の書き方を質問する
5. 結論/依頼を先に書く提案をする
6. 付箋について聞く
7. 田中さん、山田課長に聞く
8. 解答欄に真相と次の一手を書く

合格条件:

- 問題タイトルが「伝わらない報告」になる
- 固定fixture文言が画面に出ない
- 質問に対してそれっぽい返答が返る
- 解答で `stage_2_cleared` まで到達できる

### 2. API漏洩確認

目的: クライアントへ内部情報が出ていないことを確認する。

確認対象:

- `/api/generate-problem`
- `/api/dialogue`
- `/api/solve-check`
- `/api/nakamoto-hint`

出てはいけないもの:

- `truth`
- `internal`
- `answer_policy`
- `solution_criteria`
- `quality_gate`
- `characters[].known_facts`
- `characters[].unknown_facts`
- `must_not_reveal_directly`

## 優先度P1: 実LLM検証

### 3. 実LLMで問題生成を少数試す

目的: `generate-problem → validate → judge → session create` が現実のLLM出力で通るか確認する。

手順:

1. `ANTHROPIC_API_KEY` を設定
2. `KAMEO_USE_STUBS` を外して起動
3. 問題生成を1〜3回試す
4. サーバログを確認

確認ポイント:

- JSON parse失敗率
- `problem.schema.json` 違反の傾向
- `judge-quality` で落ちる理由
- 再試行ループが効いているか
- ログに `raw` が出ていないか

### 4. 実LLMで対話を試す

目的: `dialogueModel → dialogue-validation → safetyCheck → response` が通るか確認する。

確認ポイント:

- `DialogueOutputSchema` 違反が多くないか
- `referenced_fact_ids` / `disclosed_fact_ids` が正しく出るか
- `dialogue_candidate_invalid` が頻発しないか
- safetyが過剰に止めないか
- キャラが知らない情報を断定しないか

### 5. 実LLMで解答判定を試す

目的: `solve-check` がプレイヤー解答を厳しすぎず甘すぎず判定できるか確認する。

確認ポイント:

- 不正解を `stage_2_cleared` にしない
- ほぼ正解を不当に落とさない
- `player_message` がヒント過多にならない
- `can_reveal_explanation` が `stage_2_cleared` 以外で立たない

## 優先度P2: 安定化

### 6. dialogue の再生成ループ

現状:

- `safety.action === soften`
- `safety.action === regenerate`
- `safety.action === block`

はいずれもプレイヤーには届けず、502にしている。

改善案:

- 最大2〜3回の再生成を試す
- 再生成時に safety の指摘をプロンプトへ渡す
- 最終失敗時は安全な固定文で返すか、エラー表示する

### 7. nakamoto-hint の safety 適用

現状:

- 中本ヒントはプロンプトで真相再掲を禁止している
- ただし独立したsafety checkは未適用

改善案:

- 中本用の軽量safetyを追加
- history内の真相語再掲、解決策の直接提示を検出
- 問題があれば再生成または安全な定型ヒントに差し替える

### 8. candidate_disclosures の絞り込み

現状:

- 話者が確認可能な `objective_facts` を広めにdialogueModelへ渡している

改善案:

- `player_message` との簡易キーワード一致で候補を絞る
- 既出factは必要な場合だけ渡す
- LLMへ渡す内部情報量を減らす

## 優先度P3: 本番化

### 9. セッションストア永続化

現状:

- `globalThis` 上のインメモリMap
- シングルプロセス前提

本番課題:

- 複数ワーカ
- サーバレス
- 再起動
- TTL管理

改善案:

- Redis等へ置換
- セッションスキーマを明文化
- セッション削除/更新の競合を扱う

### 10. 問題ストア

目的:

- 良問を蓄積する
- 再プレイ可能にする
- few-shot/RAG元へ昇格できるようにする

昇格基準案:

- 完走率
- ユーザー評価
- 人手レビュー
- サンプルとのパターン重複なし

### 11. E2Eテスト

目的:

- UI/APIの退行を防ぐ

テスト候補:

- スタブで「開始→質問→中本→解答」
- 404 session_not_found時のUIリセット
- APIレスポンスに内部キーがないこと
- デモ問題が `stage_2_cleared` まで到達できること

## 優先度P4: 体験改善

### 12. UI改善

候補:

- 会話ログの見た目改善
- 話しかける相手の説明
- 解答欄の出し方
- 中本ヒントの表示位置
- スマホ表示の確認

### 13. 感想戦/解説モード

現状:

- `stage_2_cleared` 後に `can_reveal_explanation` は立つ
- 詳細解説APIは未実装

改善案:

- `/api/explanation`
- `session_id` ベース
- 解決後のみ真相/構造/学びを開示

## 今すぐやるなら

次の順で進めるのが現実的です。

1. スタブデモをブラウザで手動確認
2. 実LLMで問題生成を1本だけ試す
3. 生成失敗ログを見てプロンプト/スキーマを調整
4. dialogueの実LLM出力を観察
5. safety regenerateループを実装

## コミット前チェック

```bash
npm run typecheck
npm run build
npm test
```
