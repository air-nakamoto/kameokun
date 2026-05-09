#!/usr/bin/env bash
set -euo pipefail

# Resolve the known README.md conflict for the Claude Project migration PR.
#
# Usage:
#   scripts/resolve-readme-conflict.sh
#   scripts/resolve-readme-conflict.sh --commit
#
# The script writes the canonical merged README that keeps the GitHub migration
# section and adds the imported bot resources as a separate section.

commit_after=false
if [[ "${1:-}" == "--commit" ]]; then
  commit_after=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--commit]" >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

cat > README.md <<'README_EOF'
# kameokunwork

亀尾くん問題を GitHub 上で継続して作成・管理するためのリポジトリです。
問題案、レビュー、公開準備を Issue と Pull Request で見える化し、後から経緯を追える形で運用します。

## 目的

- 亀尾くん問題のアイデア、原稿、解説、修正履歴を GitHub に集約する
- 問題ごとの担当者、ステータス、レビュー結果を明確にする
- 公開済み・作成中・保留中の問題を整理し、続きを再開しやすくする

## リポジトリ構成

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/      # 問題案登録用の Issue テンプレート
│   └── pull_request_template.md
├── bot/                     # ボット向けガイドライン・会話テンプレート・口調ガイド
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

Claude Project に入れていたドキュメントを貼り付けて移行する手順は [`docs/claude-project-import.md`](docs/claude-project-import.md) を参照してください。

PR のコンフリクト解消手順は [`docs/conflict-resolution.md`](docs/conflict-resolution.md) を参照してください。

## 取り込み済みのボット資料

Claude Project から取り込んだボット向け資料は `bot/` ディレクトリで管理します。

- 統合ガイドライン: [`bot/kameo-guidelines.md`](bot/kameo-guidelines.md)
- 出題時の会話テンプレート: [`bot/kameo-templates.md`](bot/kameo-templates.md)
- 中本アイアールの口調ガイド: [`bot/nakamoto-style-guide.md`](bot/nakamoto-style-guide.md)
README_EOF

if rg -n '^(<<<<<<<|=======|>>>>>>>)' README.md >/dev/null; then
  echo "README.md still contains conflict markers" >&2
  exit 1
fi

git add README.md

echo "README.md conflict resolved and staged."

if [[ "$commit_after" == true ]]; then
  git commit -m "Resolve README conflict for bot docs"
fi
