# Splat Spots

**Community-curated directory of publicly shared Insta360 Spatial Captures.
Unofficial and not affiliated with Insta360.**

<https://afjk.github.io/splat-spots>

公式ビューアが WebXR に対応していないこと、公開キャプチャを横断して眺められる場所が
存在しないこと。この2つの欠落を埋めるために、有志が公開 Capture のリンクを持ち寄る
場所です。ビューア本体は
[`afjk/insta360-sog-xr-viewer`](https://github.com/afjk/insta360-sog-xr-viewer)。

方針の全文は [`docs/direction.md`](docs/direction.md) にあります。

## 原則

> Splat Spots does not crawl Insta360 or automatically discover captures.
> Every listing originates from a URL submitted by a person and is reviewed
> before publication.

- **Capture のホストにはならない。**`.sog` / `.ply` / 動画 / 画像を保存・再配布しない
- **Insta360 の内部 API を使わない。**共有ページを bot として取得もしない
- **自動収集をしない。**掲載はすべて人が投稿したリンクから始まる
- **即時公開しない。**人が確認してから掲載する
- **削除依頼に速やかに応じる**
- **公式と誤認される表示をしない**

カードに表示される絵は、Capture の ID からこのサイトが生成しているものです。
Insta360 由来の画像は使っていません。

## 構成

```
data/captures/<id>.json   公開カタログの「正」。1キャプチャ1ファイル
src/                      Astro の静的サイト
scripts/                  掲載と削除
  lib/catalog.mts           レコードの読み書き
src/lib/capture-id.ts     URL の検証と ID 抽出（ローカル処理のみ）
worker/                   Cloudflare Worker + D1（推薦の受付）
.github/workflows/        GitHub Pages と Worker のデプロイ
```

サイトは `data/captures/` の純粋な関数です。**1ファイル消せば、その空間は掲載から外れます。**

## 使い方

Node.js 22.13 以上。

```bash
npm install
npm run dev          # 開発サーバー
npm test             # 型チェック + ユニットテスト
npm run build        # dist/ へ静的生成
```

### 掲載する

推薦を受け取ったら、**まず自分でURLを開いて確認します。**

- 実際に開けるか
- Spatial Capture か
- 明らかに不適切な内容でないか

Splat Spots は Insta360 に問い合わせません。公開されているかどうかは、この目視確認が
唯一の判断材料です。

```bash
node scripts/add-capture.mts 'https://app.insta360.com/3dspace/detail/GS3DG…' \
  --title '任意のタイトル' \
  --tags 'tokyo,night' \
  --author '@creator' \
  --source-post 'https://…'

git commit -am '…' && git push
```

`--camera` と `--captured-at` は、**確実に分かる場合だけ**指定します。推測で埋めません。

`npm run add` 経由で使うなら `--` が必要です（`npm run add -- '<id>' --title …`）。
npm がオプションを自分のフラグとして食べるためで、直接呼ぶほうが確実です。

### 削除依頼に対応する

```bash
npm run remove -- 'GS3DG…'        # --dry-run で確認だけ
git commit -am '…' && git push    # 公開サイトから消える
```

Splat Spots はレコードしか持っていないので、**JSONを消せば削除は完了**です。
画像も動画も保持していません。

対応後、受付側の状態も更新します。

```bash
npx wrangler d1 execute splat-spots --remote -c worker/wrangler.toml \
  --command "UPDATE reports SET status='resolved' WHERE id='…'"
```

## API（Cloudflare Worker）

推薦フォームと削除依頼の受け口です。

| エンドポイント | 用途 |
|---|---|
| `POST /api/submissions` | URL を検証して D1 のキューへ |
| `POST /api/reports` | 削除・修正依頼を D1 へ |
| `GET /api/queue` | 未処理の推薦と依頼を返す（Bearer 認証） |

**Worker は Insta360 に一切アクセスしません。** することは URL の parse、hostname と
形式の確認、ID 抽出、重複の集約、D1 への保存まで。公開されているかどうかの判断は
掲載前の目視確認に委ねます。

**D1 に入った時点では何も公開されません。**人が確認して `data/captures/` に
コミットして初めて掲載されます。

### セットアップ

```bash
npx wrangler login
npx wrangler d1 create splat-spots          # 出力の database_id を worker/wrangler.toml へ
npx wrangler secret put QUEUE_TOKEN -c worker/wrangler.toml
npx wrangler deploy -c worker/wrangler.toml
```

デプロイ後、公開された URL をリポジトリ変数 `PUBLIC_API_BASE_URL` に設定します。
未設定のあいだ、フォームは壊れる代わりに「受付準備中」と表示します。

GitHub Actions から Worker を自動デプロイするには、シークレット
`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定します。

### ローカルで動かす

```bash
echo 'QUEUE_TOKEN=local-test-token' > worker/.dev.vars
cd worker && npx wrangler dev            # .dev.vars は cwd から読まれる

# 別ターミナルで
PUBLIC_API_BASE_URL=http://localhost:8787 npm run dev
```

### キューを取り込む

```bash
curl -H "Authorization: Bearer $QUEUE_TOKEN" https://<api>/api/queue
```

返ってきたURLを開いて確認し、掲載するものを `add-capture.mts` で登録します。

## スコープ外

- 広域クロールや ID 列挙による発見
- Capture 本体や派生画像の保持
- Insta360 の内部 API を用いた自動確認
- ユーザーアカウント、コメント、いいね
