# Validator フィクスチャ

[../validate-problem.mjs](../validate-problem.mjs) の回帰確認用。

## ファイル

- `valid-problem.json` — 9検査項目すべてpassする最小整合JSON。`PASS` 期待
- `demo-problem.json` — スタブモードで実際に出題するデモ問題。`PASS` 期待
- `broken-problem.json` — 9検査項目すべてに違反する壊れたJSON。`FAIL` 期待

## 確認コマンド

最も簡単なのは `npm run test:fixtures`。これで以下6ケースを一括検査します。

| ケース | 期待 |
|---|---|
| `valid + ajv` | exit 0 |
| `valid + cross-ref` | exit 0 |
| `demo + ajv` | exit 0 |
| `demo + cross-ref` | exit 0 |
| `broken + ajv` | exit 1 |
| `broken + cross-ref` | exit 1 |

個別に確認する場合:

```sh
# クロス参照のみ
node scripts/validate-problem.mjs scripts/fixtures/valid-problem.json
node scripts/validate-problem.mjs scripts/fixtures/demo-problem.json
node scripts/validate-problem.mjs scripts/fixtures/broken-problem.json

# JSON Schema のみ
npx ajv validate -s schemas/problem.schema.json -d scripts/fixtures/valid-problem.json -c ajv-formats --spec=draft2020 --strict=false

# 両方を valid に対して通す（運用時の検証パイプライン）
npm run validate
```

## 検査の二段構え

| レイヤ | 担当 | スクリプト |
|---|---|---|
| 1. JSON Schema | 型・必須・enum・minItems/maxItems・format | `ajv` (`npm run validate:schema`) |
| 2. クロス参照 | ID一意性・参照整合性・列挙網羅性・最低人数 | `validate-problem.mjs` (`npm run validate:cross`) |

両方を必ず通す。1だけ・2だけでは保証が不完全。
