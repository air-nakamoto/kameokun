# kameokunwork

亀夫君問題を GitHub 上で継続して作成・管理するためのリポジトリです。
問題案、レビュー、公開準備を Issue と Pull Request で見える化し、後から経緯を追える形で運用します。

## 目的

- 亀夫君問題のアイデア、原稿、解説、修正履歴を GitHub に集約する
- 問題ごとの担当者、ステータス、レビュー結果を明確にする
- 公開済み・作成中・保留中の問題を整理し、続きを再開しやすくする

## リポジトリ構成

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/      # 問題案登録用の Issue テンプレート
│   └── pull_request_template.md
├── docs/                    # 運用手順や移行メモ
├── problems/                # 問題本文・解説・メタ情報
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

## GitHub への移行手順

既存のローカル作業を GitHub に移す具体的な手順は [`docs/github-migration.md`](docs/github-migration.md) を参照してください。
