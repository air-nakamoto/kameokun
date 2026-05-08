# GitHub 移行手順

このメモは、亀尾くん問題プロジェクトの続きを GitHub 上で運用するための初期設定手順です。

## 1. GitHub にリポジトリを作る

1. GitHub にログインする
2. **New repository** を選ぶ
3. Repository name に `kameokunwork` などの名前を入力する
4. Public / Private を選ぶ
5. README の自動生成はオフにする（このリポジトリの README を使うため）
6. **Create repository** を押す

## 2. ローカルリポジトリと GitHub を接続する

GitHub で作成したリポジトリ URL を使って、次のように remote を追加します。

```bash
git remote add origin git@github.com:<owner>/<repo>.git
git push -u origin main
```

HTTPS を使う場合は次の形式でも構いません。

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

すでに `origin` が登録されている場合は、次のコマンドで URL を更新します。

```bash
git remote set-url origin git@github.com:<owner>/<repo>.git
```

## 3. Issue で問題案を管理する

問題案は Issue として登録します。Issue には次の情報を入れると、後から確認しやすくなります。

- 問題のねらい
- 想定する答え
- 難易度
- まだ不安な点
- 参考にしたメモや資料

## 4. Pull Request でレビューする

問題本文を追加・修正するときは、直接 main に入れず、ブランチを作って Pull Request を出します。

```bash
git switch -c problem/<short-title>
# problems/ 以下を編集
git add problems/<file>.md
git commit -m "Add <short-title> problem draft"
git push -u origin problem/<short-title>
```

Pull Request では、次の観点を確認します。

- 問題文が曖昧でないか
- 答えが一意に決まるか
- 解説が納得できるか
- 難易度や公開状態が適切か

## 5. GitHub Projects を使う場合

GitHub Projects を使う場合は、次の列を作ると運用しやすくなります。

| 列 | 用途 |
| --- | --- |
| Ideas | 思いついた問題案 |
| Drafting | 作成中 |
| Review | レビュー中 |
| Ready | 公開準備完了 |
| Published | 公開済み |
| Hold | 保留 |

## 6. 最初にやることチェックリスト

- [ ] GitHub リポジトリを作成する
- [ ] `origin` remote を設定する
- [ ] main ブランチを push する
- [ ] Issue テンプレートを確認する
- [ ] Pull Request テンプレートを確認する
- [ ] 最初の問題案を Issue として登録する
