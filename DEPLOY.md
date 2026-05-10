# デプロイ手順

## 前提

- GitHub リポジトリ: [air-nakamoto/kameokun](https://github.com/air-nakamoto/kameokun)
- Node.js 22 以上（package.json の `engines.node` で指定）

## 推奨: Render（無料プランあり、Blueprint対応）

### 手順

1. [Render](https://render.com) にサインアップ・ログイン
2. ダッシュボードで **New +** → **Blueprint**
3. GitHub と連携し、`air-nakamoto/kameokun` リポジトリを選択
4. リポジトリの [render.yaml](render.yaml) が自動検出され、Web Service が1つ作られる
5. **Apply** で初回デプロイ開始
6. 完了したら `https://kameokun.onrender.com`（仮）でアクセス可能

### 環境変数の設定（任意）

実LLMで動かすなら Render ダッシュボードの **Environment** タブで:

| Key | Value | 備考 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | secret として設定。リポジトリには絶対書かない |
| `KAMEO_USE_STUBS` | `false` または削除 | API key を入れたらスタブを切る |
| `KAMEO_SESSION_TTL_MS` | `7200000` 等 | 任意。デフォルト2時間 |
| `KAMEO_MODEL_GENERATION` 他 | snapshot ID | 任意。モデル切替 |

設定変更後は **Manual Deploy → Deploy latest commit** で再起動。

### 無料プランの注意

- 15 分アイドルでスピンダウン → 次回アクセス時 30〜60 秒の cold start
- インスタンス再起動でインメモリセッションが消える（MVP では許容）
- 月750時間の無料枠

### 有料プラン（$7/月〜）

- スピンダウンなし
- 常時起動でセッションが安定

## 代替: Railway

Railway も Next.js を自動検出する。

### 手順

1. [Railway](https://railway.app) にサインアップ
2. **New Project** → **Deploy from GitHub repo** → `air-nakamoto/kameokun` を選択
3. 自動検出で Nixpacks が `npm install && npm run build` → `npm run start` を実行
4. **Variables** タブで `ANTHROPIC_API_KEY` 等を設定
5. **Settings** → **Networking** → **Generate Domain** で公開URLを発行

Railway は free trial（$5クレジット）後は有料。常時稼働させるなら $5/月〜。

## デプロイ前のローカル確認

```sh
# 本番ビルド + 起動
npm ci
npm run build
KAMEO_USE_STUBS=true npm run start

# 別ターミナルで動作確認
curl -X POST http://localhost:3000/api/generate-problem \
  -H 'content-type: application/json' -d '{}'
```

## 既知の制約

- **インメモリセッション**: シングルインスタンス前提。複数ワーカ・複数インスタンスにすると別ストアになりセッションが見つからなくなる
- **Vercel 非推奨**: serverless functions 環境では別 lambda に着くと session_not_found が頻発
- **長期運用**: 永続化が必要になったら [lib/session-store.ts](lib/session-store.ts) を Redis (Upstash) / Vercel KV / Postgres に差し替える
