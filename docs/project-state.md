# プロジェクト現状メモ

このファイルは、一旦作業を中断しても再開しやすいように、Kameokun MVPの現状・構成・次タスクをまとめたものです。

具体的な優先順位と実装候補は [実装計画と課題一覧](implementation-plan.md) を参照してください。

## 現在の状態

- Next.js App Router のMVPが実装済み
- ブラウザ上で以下の流れを操作可能
  - 問題生成
  - 登場人物との対話
  - 解答判定
  - 中本さんヒント
- `KAMEO_USE_STUBS=true` ではデモ問題「伝わらない報告」と簡易スタブ応答で動作
- `ANTHROPIC_API_KEY` を入れると実LLM経路に切り替わる
- 問題JSON、真相、解決条件はサーバ側セッションに保持し、クライアントには返さない

## 起動方法

依存関係のインストール:

```bash
npm install
```

スタブモード:

```bash
KAMEO_USE_STUBS=true npm run dev
```

実LLMモード:

```bash
ANTHROPIC_API_KEY=... npm run dev
```

確認:

```bash
npm run typecheck
npm run build
npm test
```

## 環境変数

| 変数 | 用途 |
| --- | --- |
| `ANTHROPIC_API_KEY` | Anthropic APIキー |
| `KAMEO_USE_STUBS` | `true` ならLLMを呼ばずスタブ応答 |
| `KAMEO_MODEL_GENERATION` | 問題生成モデル |
| `KAMEO_MODEL_DIALOGUE` | 対話モデル |
| `KAMEO_MODEL_JUDGE` | 品質判定モデル |
| `KAMEO_MODEL_SOLVE_CHECK` | 解答判定モデル |
| `KAMEO_MODEL_SAFETY` | 安全検査モデル |
| `KAMEO_MODEL_NAKAMOTO_HINT` | 中本ヒントモデル |
| `KAMEO_SESSION_TTL_MS` | セッションTTL。未指定時は2時間 |

## 主要ファイル

### アプリ

- `app/client-page.tsx`
  - MVPのクライアントUI
  - 公開情報、会話履歴、解答欄、中本ヒントを表示
- `app/api/generate-problem/route.ts`
  - 問題生成、検証、品質判定、セッション作成
  - `truth` や `internal` はクライアントに返さない
- `app/api/dialogue/route.ts`
  - セッションから制限ビューを組み立て、dialogueModelを呼ぶ
  - dialogue出力検証後、safetyCheckを通してから履歴に保存
- `app/api/solve-check/route.ts`
  - 解答判定
  - 内部判定詳細は返さず、プレイヤー向け文言だけ返す
- `app/api/nakamoto-hint/route.ts`
  - 中本ヒント
  - `session_id` のみ受け取り、問題JSONは受け取らない

### ライブラリ

- `lib/llm.ts`
  - Anthropic SDKラッパ
  - モデルロール抽象化、JSON parse、zod検証、raw redaction
- `lib/session-store.ts`
  - TTL付きインメモリセッションストア
  - 本番の複数ワーカ運用ではRedis等へ置換予定
- `lib/restricted-views.ts`
  - dialogueModel / nakamotoHintModel に渡す制限ビューを生成
- `lib/safety-check.ts`
  - dialogue応答の内部安全検査
  - 外部APIとして公開しない
- `lib/dialogue-validation.ts`
  - LLMのdialogue出力が入力制限ビューと整合しているか検査
- `lib/validate-problem.ts`
  - アプリ内で `problem.schema.json` + クロス参照検証を実行

### プロンプト

- `prompts/generate-problem.md`
  - 問題生成
  - 再試行時の `$PREVIOUS_ATTEMPT_FEEDBACK` に対応
- `prompts/judge-quality.md`
  - 9つのfail conditionで問題品質を判定
- `prompts/dialogue-character.md`
  - 登場人物として回答
- `prompts/safety-check.md`
  - 真相漏洩、解決策先出し、越権回答などを検査
- `prompts/solve-check.md`
  - プレイヤー解答を `solution_criteria` に照らして判定
- `prompts/nakamoto-hint.md`
  - 中本アイアールとして進行ヒントを出す
  - history内の強い真相表現を再掲しないよう制約済み

### スキーマ・検証

- `schemas/problem.schema.json`
  - AI生成問題JSONの契約
- `scripts/validate-problem.mjs`
  - CLI用クロス参照検証
- `scripts/test-fixtures.mjs`
  - valid/demo/broken fixtureの正負テスト
- `scripts/test-session-ttl.mjs`
  - セッションTTLテスト

## 安全設計

- クライアントは `session_id` と `public` 情報だけを持つ
- `/api/generate-problem` は `public` と `characters_overview` だけ返す
- `/api/dialogue` は `session_id` を受け取り、制限ビューをサーバ側で作る
- `/api/solve-check` は `session_id` と解答だけ受け取る
- `/api/nakamoto-hint` は `session_id` だけ受け取る
- `safety-check` は公開API化せず内部関数として呼ぶ
- LLMの生出力 `raw` はログにも出さず `[redacted]` にする
- `details` はクライアントへ返さない

## 既知の制約

- セッションはインメモリMap
  - シングルワーカ前提
  - 本番の複数ワーカ/サーバレス環境ではRedis等が必要
- LLM実走は未確認
  - スタブモードでは `typecheck` / `build` / `test` 済み
  - 実APIキー投入後、生成JSONの安定性確認が必要
- dialogue safety の再生成ループは未実装
  - 現状は `soften` / `regenerate` / `block` で502
- 中本ヒントには独立したsafetyCheckをまだ通していない
  - プロンプト側で真相再掲を禁止しているが、追加ガード余地あり
- `candidate_disclosures` は話者が確認可能なfactを広めに渡している
  - 将来 `player_message` で簡易フィルタすると安全度が上がる

## 次の改善候補

優先度順の候補です。

1. **実LLM通しテスト**
   - `ANTHROPIC_API_KEY` を入れて問題生成を1〜3本試す
   - 生成失敗ログに `raw` が出ていないことを確認
   - `public` 以外がAPIレスポンスに出ていないことを確認

2. **dialogue の regenerate ループ**
   - `safety.action === regenerate` / `soften` のときに再生成
   - 再生成回数上限を設ける

3. **nakamoto-hint の safety 適用**
   - 中本出力にも軽量safetyを通す
   - 真相語の再掲・解決策提示を検出

4. **candidate_disclosures の簡易フィルタ**
   - `player_message` とfact文のキーワード近似で候補を絞る
   - LLMへ渡す客観事実を減らす

5. **永続セッションストア**
   - `lib/session-store.ts` をRedis等へ置換
   - 複数ワーカ/本番環境対応

6. **問題ストア**
   - 良問を保存
   - 完走率・評価・人手レビューでfew-shot昇格

7. **E2Eテスト**
   - Playwrightで「開始→質問→中本→解答」のスタブフローを検証

## Git運用メモ

- 現在は `main` へ直接push運用
- 大きめの変更はブランチを切ってPR推奨
- コミット前の推奨確認:

```bash
npm run typecheck
npm run build
npm test
```
