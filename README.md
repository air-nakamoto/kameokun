# kameokun

水平思考ユニットうみがめ部の**亀夫君問題**出題ボットの開発リポジトリです。
問題案、レビュー、公開準備を Issue と Pull Request で見える化し、後から経緯を追える形で運用します。

## 亀夫君問題とは

「悩める登場人物」と「自由に会話ができる」推理ゲームです。
質問者が質問を重ねて、登場人物の抱える問題を解決に導くことがゴールとなります。
うみがめ部版では**真相解明＋問題解決の2段階クリア方式**を採用しています。

## 目的

- 亀夫君問題のアイデア、原稿、解説、修正履歴を GitHub に集約する
- ボットのガイドライン・テンプレート・サンプル問題を管理する
- 問題ごとの担当者、ステータス、レビュー結果を明確にする
- 公開済み・作成中・保留中の問題を整理し、続きを再開しやすくする

## リポジトリ構成

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/             # 問題案登録用の Issue テンプレート
│   └── pull_request_template.md
├── docs/
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
├── problems/                       # 問題本文・解説・メタ情報
│   ├── template.md
│   └── README.md
└── README.md
```

## 基本ワークフロー

1. 新しい問題案は GitHub Issue として登録する
2. 採用する問題は `problems/template.md` をコピーして問題ファイルを作る
3. 作業用ブランチで本文、答え、解説、確認メモを編集する
4. Pull Request を作成し、表現・難易度・答えの一意性をレビューする
5. レビュー完了後に main ブランチへマージする

## 問題ファイルの命名規則

問題ファイルは `problems/YYYY-MM-DD-short-title.md` の形式で作成します。

例:

```text
problems/2026-05-08-sample-kameokun.md
```

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

- [統合ガイドライン](docs/guidelines/bot-guideline.md) — ボットの動作ルール・品質基準
- [出題テンプレート集](docs/guidelines/presentation-templates.md) — 出題〜感想戦のセリフテンプレート
- [中本アイアール口調ガイド](docs/guidelines/nakamoto-voice-guide.md) — キャラクター設定・口調ルール
- [Radio台本](docs/guidelines/radio-script-template.md) — ナカ×タケの水平思考Radio番組構成
- [GitHub移行手順](docs/github-migration.md) — ローカル作業からの移行ガイド

