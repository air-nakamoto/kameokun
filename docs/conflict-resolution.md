# GitHub PR のコンフリクト解消手順

このドキュメントは、GitHub の Pull Request 画面で `README.md` の merge conflict が表示されたときに、Codex またはローカル環境で自動的に解消するための手順です。

## 前提

現在確認しているコンフリクト対象は `README.md` です。解決方針は次の通りです。

- GitHub への移行手順を残す
- Claude Project から取り込んだ `bot/` 資料へのリンクを残す
- `bot/` はリポジトリ構成に含める
- conflict marker（`<<<<<<<`, `=======`, `>>>>>>>`）を残さない

## Codex に任せる場合

Codex に依頼する場合は、次のように伝えます。

```text
README.md のコンフリクトを scripts/resolve-readme-conflict.sh で解決して、コミットと PR 作成まで進めてください。
```

Codex は次のコマンドを実行します。

```bash
scripts/resolve-readme-conflict.sh --commit
```

## 手元で実行する場合

PR ブランチをチェックアウトしてから、次を実行します。

```bash
scripts/resolve-readme-conflict.sh --commit
git push origin HEAD:<pull-request-branch>
```

今回の PR 画面に表示されているブランチ名が `codex/migrate-project-to-github-xx32s1` の場合は、次のように push します。

```bash
git push origin HEAD:codex/migrate-project-to-github-xx32s1
```

## script が行うこと

`scripts/resolve-readme-conflict.sh` は、既知の README コンフリクトに対して次の処理を行います。

1. 統合済みの canonical README を `README.md` に書き込む
2. conflict marker が残っていないことを確認する
3. `README.md` を `git add` する
4. `--commit` が指定されている場合は `Resolve README conflict for bot docs` でコミットする

## 注意

この script は、今回の README コンフリクト解消に特化しています。`README.md` に新しい重要な追記がある場合は、実行前に内容を確認してください。
