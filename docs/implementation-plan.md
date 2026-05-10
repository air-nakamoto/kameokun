# 実装計画と課題一覧

このファイルは、Kameokun MVPを本番利用に近づけるための残課題と実装順序をまとめたものです。

> **次セッション再開時はここを起点に**: 「次フェーズ企画」セクション（αβγ）が現在の主軸プラン。詳細は下方の P0〜P4 を参照。

## 現在の到達点（2026-05-10）

### MVPコア
- Next.js App RouterでMVP画面/APIが動く
- スタブモードではデモ問題「伝わらない報告」を出題できる
- デモ問題で「問題開始 → 質問 → 解答判定 → 中本ヒント → 感想戦」まで通る
- 実LLM接続層は実装済み（`ANTHROPIC_API_KEY` 投入で切替）
- **Render に本番デプロイ済み**: https://kameokun.onrender.com（スタブモード稼働中）

### 直近で実装したもの
- `feat: add post-clear explanation (感想戦) API and UI` (b96f1c9, 2026-05-10)
  - `/api/explanation` 追加。`stage_2_cleared` 限定、`session.stage !== 'stage_2'` で 403
  - `prompts/explanation.md`（中本口調＋ネタばらし許可モード）
  - `ExplanationOutputSchema`（zod）
  - `lib/demo-stub.ts` の `buildDemoExplanation`
  - UI に「🐢 解説を見る（感想戦）」ボタンと解説カード
  - これにより **P4 #13 感想戦/解説モード** は完了

### まだ未確認
- 実LLM通しテスト（API key 投入後の生成・対話・解答・安全・感想戦）
- 本番URLでの感想戦UI動作（autoDeploy 後）

---

## 次フェーズ企画: 「もう一問やりたい」体験を作る（α → β → γ）

水平思考ゲームの本質は **多様な問題を、人と一緒に語りながら解く** こと。MVPを次のステージへ持っていくには「**もう一問やりたい / 友達に解かせたい**」を満たす機能を積む。

### Phase α: 実LLMで多様な問題を作れる土台（〜1日）

**目的**: 同じ問題ばかりではなく、毎回違う物語が出る状態にする。

**やること**:
- Render Environment タブで `ANTHROPIC_API_KEY` を secret として設定
- `KAMEO_USE_STUBS` を削除して再デプロイ
- 本番URLで通しプレイ1〜3回
- Render の Logs タブで観察:
  - `[generate-problem] success { attempt: N }` が出ること
  - JSON parse 失敗 / judge fail / safety regenerate / block の頻度
  - `raw` が `[redacted]` になっていること
  - dialogue 候補検証 (`dialogue_candidate_invalid`) の頻度
- 観察結果をこの計画書に追記、必要に応じてプロンプト微調整

**価値**: 同じ問題ばかりではなく、毎回違う物語が出る。これだけで体験は劇的に変わる。

### Phase β: 問題ライブラリ（〜2日）

**目的**: LLM出力の当たり外れを資産化、再プレイ・後で他のプレイヤーが同じ問題を解ける土台。

**やること**:
- 永続化バックエンド導入（**推奨: Upstash Redis 無料枠**、軽量で Render と相性良い）
  - `lib/session-store.ts` をインメモリ→ Upstash に差替（`Session` 型は維持）
  - 環境変数: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- 問題保存:
  - 解決後、感想戦カードの下に「この問題を保存する」ボタン
  - 保存されたら `problems:{problem_id}` キーで Redis に永続化
  - スキーマ: `problem.schema.json` 準拠の JSON + メタ（保存日時、保存者匿名ID）
- トップページの選択肢:
  - 「保存された問題から選ぶ」（リスト）
  - 「新しく作る」（既存フロー）
- プレイ履歴（軽量）:
  - `play_logs:{problem_id}` に「いつ・どれくらいで・どこまで到達したか」を追記
  - クライアントには集計値だけ返す

**価値**: 「いい問題」を温存できる。復習・再プレイができる。

### Phase γ: 共有とコミュニティの芽（〜2日）

**目的**: 「これ面白かったから君もやって」という拡散ループを作る。

**やること**:
- 共有URL: `/play/<problem_id>` で同じ問題を別セッションで開ける
- 共有ボタン: 解決後、感想戦カードに「友達に渡す」ボタン
- 軽い社会的指標:
  - 「○人が挑戦中／△人が解決」をプレイ画面に表示（個人特定なし）
  - 平均所要時間（解決した人だけ）
- ★評価（任意）:
  - 解決後に「面白かった度」を5段階で評価
  - 高評価が集まった問題は将来 few-shot 元にする候補
- 公開範囲: **リンク限定**（最初は安全側）

**価値**: コンテンツが増えるほど場が育つ構造。

### ロードマップ

| フェーズ | 内容 | 工数 | 累積期間 |
|---|---|---|---|
| α | 実LLM稼働＋観察 | 0.5日（観察1日） | 1.5日 |
| β | 問題ライブラリ＋保存 | 2日 | 3.5日 |
| γ | 共有URL＋社会的指標 | 2日 | 5.5日 |

トータルで **約1週間** で「人に勧められるサービス」になる。

### 推奨

**α → β → γ の順** が堅い:
- α が無いと β に保存する価値ある問題が出ない
- β で資産が溜まると γ の共有が意味を持つ
- 各フェーズが単独でも体験を改善（途中で止めても価値が残る）

### 設計判断ポイント（β に着手する時に決める）

| 判断 | 候補 | 暫定推奨 |
|---|---|---|
| 永続化バックエンド | Vercel KV / Upstash Redis / SQLite (Render Disk) / Postgres | **Upstash Redis 無料枠** |
| 問題保存タイミング | 解決時自動 / 明示保存 | **明示保存**（質を保つため） |
| 共有URLの粒度 | session 単位 / 問題 単位 | **問題単位**（リプレイ可能性） |
| 公開範囲 | 全公開 / リンク限定 | **リンク限定**（最初は安全側） |
| 評価UI | 5段階★ / 👍👎 / なし | **5段階★（任意）** |

---

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
