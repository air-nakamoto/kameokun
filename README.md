# kameokun

水平思考ユニットうみがめ部の**亀夫君問題**を、AIが生成・出題・対話進行するためのWebサービスMVPです。

現在は Next.js App Router で、以下の一連の流れをブラウザから試せます。

1. AIが亀夫君問題を生成する
2. サーバ側に真相JSONを保持し、プレイヤーには公開情報だけを返す
3. プレイヤーが登場人物へ質問する
4. AIが登場人物として回答し、safety checkを通してから表示する
5. プレイヤーが解答を提出し、AIが解決判定する
6. 行き詰まったら「中本さんを呼ぶ」でヒントをもらう

## 亀夫君問題とは

「悩める登場人物」と「自由に会話ができる」推理ゲームです。
質問者が質問を重ねて、登場人物の抱える問題を解決に導くことがゴールとなります。
うみがめ部版では**真相解明＋問題解決の2段階クリア方式**を採用しています。

## 目的

- AIが「亀夫君問題」として成立する新作問題を生成できるようにする
- 真相・内部設定・解決条件をクライアントへ漏らさない設計にする
- 生成、品質判定、対話、安全検査、解答判定を分離する
- ガイドライン、プロンプト、スキーマ、検証スクリプトをGitHubで管理する
- 一旦中断しても、構成と次タスクを追って再開しやすくする

## 再開時にまず読むもの

- [プロジェクト現状メモ](docs/project-state.md) — 現在の構成、起動方法、残課題
- [問題スキーマ](schemas/problem.schema.json) — AI生成問題JSONの契約
- [生成プロンプト](prompts/generate-problem.md) — 問題生成の指示
- [統合ガイドライン](docs/guidelines/bot-guideline.md) — 亀夫君問題の作問・進行ルール

## セットアップ

```bash
npm install
```

スタブモードで起動する場合:

```bash
KAMEO_USE_STUBS=true npm run dev
```

実LLMを使う場合:

```bash
ANTHROPIC_API_KEY=... npm run dev
```

モデルは環境変数で差し替えできます。

```bash
KAMEO_MODEL_GENERATION=...
KAMEO_MODEL_DIALOGUE=...
KAMEO_MODEL_JUDGE=...
KAMEO_MODEL_SOLVE_CHECK=...
KAMEO_MODEL_SAFETY=...
KAMEO_MODEL_NAKAMOTO_HINT=...
```

## 開発コマンド

```bash
npm run typecheck
npm run build
npm test
```

検証系:

```bash
npm run validate        # valid fixture に対する schema + cross-ref 検証
npm run test:fixtures   # valid は通り、broken は落ちることを確認
npm run test:session-ttl
```

## リポジトリ構成

```text
.
├── app/                            # Next.js App Router
│   ├── api/
│   │   ├── generate-problem/       # 問題生成 + セッション作成
│   │   ├── dialogue/               # 登場人物との対話
│   │   ├── solve-check/            # 解答判定
│   │   └── nakamoto-hint/          # 中本ヒント
│   ├── client-page.tsx             # MVPチャットUI
│   └── page.tsx
├── .github/
│   ├── ISSUE_TEMPLATE/             # 問題案登録用の Issue テンプレート
│   └── pull_request_template.md
├── docs/
│   ├── project-state.md            # 現状・再開手順・残課題
│   ├── guidelines/                 # ボット運用ガイドライン
│   │   ├── bot-guideline.md        #   統合ガイドライン（2段階クリア方式等）
│   │   ├── presentation-templates.md #   出題テンプレート集
│   │   ├── nakamoto-voice-guide.md #   中本アイアール口調ガイド
│   │   └── radio-script-template.md #   ナカ×タケの水平思考Radio台本
│   ├── samples/                    # サンプル問題・プレイログ
│   │   ├── sample01-project-pressure.md
│   │   ├── sample02-forget-the-past.md
│   │   ├── sample03-promise-to-cherish.md
│   │   ├── sample04-misunderstood-report.md
│   │   └── sample05-propose-failure.md
│   └── github-migration.md        # GitHub移行手順メモ
├── lib/                            # API共通処理、LLM、セッション、制限ビュー
│   ├── llm.ts                      # Anthropic SDKラッパ
│   ├── session-store.ts            # TTL付きインメモリセッション
│   ├── restricted-views.ts         # LLMへ渡す制限ビュー
│   ├── safety-check.ts             # 対話応答の安全検査
│   └── validate-problem.ts         # アプリ内問題JSON検証
├── prompts/                        # 生成・判定・対話・安全検査プロンプト
├── schemas/
│   └── problem.schema.json         # 問題JSONスキーマ
├── scripts/                        # CLI検証・テスト
├── problems/                       # 問題本文・解説・メタ情報
│   ├── template.md
│   └── README.md
├── package.json
└── README.md
```

## MVPのAPI

- `POST /api/generate-problem`
  - 入力: 任意の生成条件
  - 出力: `session_id`, `public`, `characters_overview`
  - `truth` や `internal` は返さない
- `POST /api/dialogue`
  - 入力: `session_id`, `player_message`, 任意の `speaker_id`
  - 出力: 登場人物の応答
- `POST /api/solve-check`
  - 入力: `session_id`, `player_answer`
  - 出力: `status`, `can_reveal_explanation`, `player_message`
- `POST /api/nakamoto-hint`
  - 入力: `session_id`
  - 出力: 中本アイアールのヒント

## 安全設計の要点

- クライアントは `session_id` と公開情報だけを持つ
- 問題JSON全体、真相、解決条件はサーバ側セッションに保持する
- 対話LLMには `restricted-views.ts` で切り出した制限ビューだけを渡す
- 対話応答は `safety-check` を通してからプレイヤーに返す
- 解答判定は内部判定とプレイヤー向け文言を分離する
- 中本ヒントは真相語や解決策を再掲しない

## 問題ファイルの命名規則

手動で問題ファイルを追加する場合は `problems/YYYY-MM-DD-short-title.md` の形式で作成します。

## ステータスの目安

| ステータス | 意味 |
| --- | --- |
| idea | アイデア段階 |
| draft | 下書き中 |
| review | レビュー依頼中 |
| ready | 公開可能 |
| published | 公開済み |
| hold | 保留 |

## ドキュメント

- [プロジェクト現状メモ](docs/project-state.md) — MVP構成・起動方法・残課題
- [統合ガイドライン](docs/guidelines/bot-guideline.md) — ボットの動作ルール・品質基準
- [出題テンプレート集](docs/guidelines/presentation-templates.md) — 出題〜感想戦のセリフテンプレート
- [中本アイアール口調ガイド](docs/guidelines/nakamoto-voice-guide.md) — キャラクター設定・口調ルール
- [Radio台本](docs/guidelines/radio-script-template.md) — ナカ×タケの水平思考Radio番組構成
- [GitHub移行手順](docs/github-migration.md) — ローカル作業からの移行ガイド
