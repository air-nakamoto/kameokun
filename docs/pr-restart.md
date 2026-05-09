# Pull Request を作り直すときの手順

古い Pull Request が merge conflict などでマージできない場合は、無理に同じ PR を直し続けず、古い PR を閉じてから新しい PR を作り直します。

## 今回の方針

- マージできない古い Pull Request は閉じる
- 現在のリポジトリ内容を基準に、改めて新しい Pull Request を作る
- `README.md` には、GitHub 移行手順と Claude Project から取り込んだ `bot/` 資料の両方を残す
- 新しい Pull Request では、過去の conflict marker を持ち込まない

## 作り直し手順

```bash
git status
git switch -c refresh/claude-project-migration
git add .
git commit -m "Refresh Claude Project migration materials"
git push -u origin refresh/claude-project-migration
```

その後、GitHub で `refresh/claude-project-migration` から `main` へ Pull Request を作成します。

## 確認すること

新しい Pull Request を作成したら、次を確認します。

- `README.md` が conflict していない
- `bot/`、`docs/`、`problems/`、`.github/` の追加内容が含まれている
- GitHub の merge ボタンが有効になっている
- もし conflict が出た場合は、`docs/conflict-resolution.md` の手順で `README.md` を整理する

## Codex に依頼するときの言い方

```text
古い Pull Request は閉じました。現在の内容を基準に、新しい Pull Request 用に更新して、コミットと PR 作成まで進めてください。
```
