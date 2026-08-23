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
> Every listing originates from a URL submitted by a person.

- **Capture のホストにはならない。**`.sog` / `.ply` / 動画を保存・再配布しない
- **Insta360 由来の画像は持たない。**カードのサムネイルは投稿者がアップロードしたものだけ
- **Insta360 の内部 API を使わない。**共有ページを bot として取得もしない
- **自動収集をしない。**掲載はすべて人が投稿したリンクから始まる
- **即時公開する。**掲載前の確認は挟まない。防御は事後（[理由](docs/direction.md#なぜ事前確認をやめたか)）
- **削除依頼に速やかに応じる**
- **公式と誤認される表示をしない**

サムネイルが無い Capture のカードには、ID からこのサイトが生成した絵が出ます。
サムネイルはその上に重なるだけなので、画像が落ちてもカードは崩れません。
**画像は git に入れず D1 にだけ置きます** — 一度コミットした画像は履歴に残り続け、
「消しました」が嘘になるためです。

## 構成

```
data/captures/<id>.json   コミット済みのカタログ。1キャプチャ1ファイル
worker/                   Cloudflare Worker + D1（投稿の受付とライブなカタログ）
src/                      Astro の静的サイト
  lib/live.ts               API から来た行の検証（テスト対象）
  lib/live-card.ts          ライブな分のカード生成（textContent のみ）
  lib/thumbnail.ts          投稿画像を 4:3 に焼き直す（ブラウザ側）
  pages/404.astro           ビルド後に追加されたスポットの /s/<id>
  lib/capture-id.ts         URL の検証と ID 抽出（ローカル処理のみ）
scripts/                  掲載と削除
  lib/catalog.mts           レコードの読み書き
.github/workflows/        GitHub Pages と Worker のデプロイ
```

カタログは2つに割れています。**git の分**はビルド時に実 HTML になり、
**D1 の分**はギャラリーが読み込み後に取得して足します。
同じ id が両方にあれば git が勝ちます。

## 使い方

Node.js 22.13 以上。

```bash
npm install
npm run dev          # 開発サーバー
npm test             # 型チェック + ユニットテスト
npm run build        # dist/ へ静的生成
```

### git に残す

投稿はフォームから入った時点でもう載っています。この操作は、**残したいものを
コミット済みの側へ移す**ためのものです。移しても URL は変わりません。

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

掲載は git と D1 の2箇所から来るので、**外すのも2箇所**です。
`npm run remove` は git のファイルを消し、D1 側の2文を必ず出力します。

```bash
npm run remove -- 'GS3DG…'        # --dry-run で確認だけ
git commit -am '…' && git push    # ビルド済みの側から消える

npx wrangler d1 execute splat-spots --remote -c worker/wrangler.toml \
  --command "UPDATE submissions SET status='removed' WHERE capture_id='GS3DG…'; \
             DELETE FROM thumbnails WHERE capture_id='GS3DG…'"
```

`removed` にした id は、**再投稿されても戻りません。**サムネイルは持っているのが
バイト列そのものなので、隠すのではなく消します。これで削除は完了です。

依頼への対応が済んだら、受付側の状態も更新します。

```bash
npx wrangler d1 execute splat-spots --remote -c worker/wrangler.toml \
  --command "UPDATE reports SET status='resolved' WHERE id='…'"
```

## API（Cloudflare Worker）

投稿と削除依頼の受け口であり、ライブなカタログでもあります。

| エンドポイント | 用途 |
|---|---|
| `POST /api/submissions` | URL を検証して D1 へ。**その時点で掲載**。サムネイルもここ |
| `GET /api/captures` | ライブなカタログとサムネイルの一覧 |
| `GET /api/thumbnails/<id>` | サムネイル1枚（URL に version が入るので長期キャッシュ） |
| `POST /api/reports` | 削除・修正依頼を D1 へ |
| `GET /api/queue` | 入ってきたものと未処理の依頼（Bearer 認証） |

**Worker は Insta360 に一切アクセスしません。** することは URL の parse、hostname と
形式の確認、ID 抽出、重複の集約、D1 への読み書きまで。実際に公開されているかどうかは
確かめません。

事前の確認がない代わりに、次を置いています。

- ハニーポット項目（埋まっていたら保存せず成功を返す）
- 1時間あたりの投稿数の上限（投稿20 / 依頼10。IP はハッシュ化して数えるだけ）
- 投稿者が入れた文字列は必ず `textContent` で描画（`src/lib/live-card.ts`）
- サムネイルは 400KB まで。宣言された MIME と実バイトの先頭が一致しなければ弾き、
  `nosniff` を付けて返す。**Worker は画像をデコードしません**

サムネイルはブラウザ側で 4:3・最大 1200×900 の JPEG に焼き直してから送られます
（`src/lib/thumbnail.ts`）。縦長でもパノラマでも切り落とさず全体を入れ、余白は
自分自身をぼかしたもので埋めます。EXIF は焼き直しの過程で落ちます。

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

### 入ってきたものを見る

```bash
curl -H "Authorization: Bearer $QUEUE_TOKEN" https://<api>/api/queue
```

最近の投稿と、未処理の削除・修正依頼が返ります。外すものは上の UPDATE で外し、
残すものは `add-capture.mts` で git に落とします。

## スコープ外

- 広域クロールや ID 列挙による発見
- Capture 本体や、Insta360 由来の画像・動画の保持
- Insta360 の内部 API を用いた自動確認
- 掲載前の人手による確認
- ユーザーアカウント、コメント、いいね
