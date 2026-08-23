# Splat Spots

**Unofficial gallery of Insta360 Spatial Captures** — <https://afjk.github.io/splat-spots>

公式ビューアが WebXR に対応していないこと、公開キャプチャを横断して眺められる場所が
存在しないこと。この2つの欠落を埋めるための、有志による非公式ギャラリーです。
ビューア本体は [`afjk/insta360-sog-xr-viewer`](https://github.com/afjk/insta360-sog-xr-viewer)。

方針の全文は [`docs/direction.md`](docs/direction.md) にあります。

## 何を持ち、何を持たないか

- 載せるのは**すでに一般公開された共有リンク**とその情報だけ
- **3Dアセット（`.sog` / `.ply`）は保持しない。**閲覧時に公開元から直接読み込む
- サムネイル（静止画・短いループ動画）だけを派生物として保持する
- ID の総当たりやクロールはしない
- 撮影者からの削除・修正依頼を受け付ける

## 構成

```
data/captures/<id>.json   公開カタログの「正」。1キャプチャ1ファイル
public/thumbs/<id>/       派生サムネイル（ビルド成果物・コミットしない）
src/                      Astro の静的サイト
scripts/                  登録・検証・サムネ生成
  lib/catalog.mts           レコードの読み書きと正規化
  lib/insta360.mts          detail API クライアント
.github/workflows/        GitHub Pages へのデプロイ
```

サイトは `data/captures/` の純粋な関数です。**1ファイル消せば、その空間は掲載から外れます。**

## 使い方

Node.js 22.13 以上と ffmpeg が必要です。

```bash
npm install
npm run dev          # 開発サーバー
npm test             # 型チェック + ユニットテスト
npm run typecheck    # 型だけ
npm run build        # dist/ へ静的生成
```

`worker/` は Cloudflare の型が必要なので、独立した tsconfig で別に検査します。
`npm run typecheck` は両方を見ます。

### キャプチャを登録する

```bash
# npm はオプションを自分のフラグとして食べるので、`--` が要ります。
npm run add -- 'https://app.insta360.com/3dspace/detail/GS3DG…' \
  --title '任意のタイトル' \
  --tags 'tokyo,night' \
  --source-post 'https://…' \
  --author '撮影者'

npm run thumbs       # 足りないサムネイルだけ生成
```

`--` を忘れるとURLだけが渡り、タグやタイトルは黙って無視されます。
直接呼べばその落とし穴はありません。

```bash
node scripts/add-capture.mts '<URL>' --tags 'tokyo,night'
```

`add` は Insta360 に公開状態を照会し、**非公開なら登録を拒否します**。
タイトルなどを省略すると Insta360 が持つ情報で埋まります。

### 削除依頼に対応する

```bash
npm run remove -- 'GS3DG…'        # --dry-run で確認だけ
git commit -am '…' && git push    # 公開サイトから消える
```

レコードと派生サムネイルを**必ず一緒に**消します。JSONだけ消すと一覧からは
外れますが、その場所の画像が推測可能なURLに残り続けるためです。

**サムネイルはコミットされないため、git 履歴にも残りません。** レコードを消せば、
次のビルドがカタログと照合して該当ディレクトリを削除します。削除は完全です。

対応後、受付側の状態も更新します。

```bash
npx wrangler d1 execute splat-spots --remote -c worker/wrangler.toml \
  --command "UPDATE reports SET status='resolved' WHERE id='…'"
```

### 掲載状態を確認する

```bash
npm run verify       # 全件を再照会し、共有解除されたものを unavailable にする
```

ネットワークが不調なだけのときは掲載を落としません。レコードの削除は自動化せず、
常に人の判断で行います。

## サムネイルについて

Insta360 の `effect` 動画から生成します。この素材には癖があります。

- **H.265 (HEVC Main 10)** — ブラウザ互換のため H.264 に変換する
- **1080×1920 の縦型** — カードは 4:5。切り出しはエンコード時に行う
- **実シーンが現れるのは末尾の2〜3秒だけ** — 前半は粒子が集まる演出なので、末尾からサンプルする

`npm run thumbs` は `public/thumbs/` を `data/captures/` に一致させます。
レコードのないサムネイルは削除されるので、消したキャプチャがビルドキャッシュ経由で
復活することはありません。

静止画は末尾付近の数フレームを試し、**最も情報量の多いもの**を選びます。カメラの
最終位置は制御できないため、これがないと壁で終わったクリップは壁の絵になります。
それでも良くないときは秒数を指定できます。

```bash
npm run thumbs -- --only GS3DG… --at 2.0 --force   # 末尾から2.0秒の位置を使う
```

生成済みのサムネイルは再生成しません（`--force` で明示的に上書き）。

## API（Cloudflare Worker）

投稿フォームと削除依頼の受け口。Insta360 の detail API が CORS ヘッダを返さないため、
静的サイトから公開状態を確認できない。**Worker が存在する理由はこの一点**にある。

| エンドポイント | 用途 |
|---|---|
| `POST /api/submissions` | URL を正規化・公開検証して D1 のキューへ |
| `POST /api/reports` | 修正・削除依頼を D1 へ |
| `GET /api/queue` | 未処理の投稿と依頼を返す（Bearer 認証） |

**D1 に入った時点では何も公開されない。**人が確認して `data/captures/` に
コミットして初めて掲載される。

### セットアップ

```bash
npx wrangler login
npx wrangler d1 create splat-spots          # 出力の database_id を worker/wrangler.toml へ
npx wrangler secret put QUEUE_TOKEN -c worker/wrangler.toml
npx wrangler deploy -c worker/wrangler.toml
```

デプロイ後、公開された URL をリポジトリ変数 `PUBLIC_API_BASE_URL` に設定する。
未設定のあいだ、フォームは壊れる代わりに「受付準備中」と表示する。

GitHub Actions から Worker を自動デプロイする場合は、シークレット
`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を設定する。

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

返ってきた内容を確認し、掲載するものを `npm run add` で登録する。

## 現在の構成と今後

フロントエンドは GitHub Pages、カタログは git、受付は Cloudflare Workers + D1。
次はキューの取り込み自動化と、日次の公開状態確認です（`docs/direction.md` の Phase 3）。

旧 Next.js + Cloudflare 実装は撤去済みです。
