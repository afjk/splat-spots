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
public/thumbs/<id>/       派生サムネイル（コミットされる）
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
npm test             # ユニットテスト
npm run build        # dist/ へ静的生成
```

### キャプチャを登録する

```bash
npm run add 'https://app.insta360.com/3dspace/detail/GS3DG…' \
  --title '任意のタイトル' \
  --tags 'tokyo,night' \
  --source-post 'https://…' \
  --author '撮影者'

npm run thumbs       # 足りないサムネイルだけ生成
```

`add` は Insta360 に公開状態を照会し、**非公開なら登録を拒否します**。
タイトルなどを省略すると Insta360 が持つ情報で埋まります。

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

生成済みのサムネイルは再生成しません（`--force` で明示的に上書き）。

## 現在の構成と今後

フロントエンドは GitHub Pages、カタログは git。投稿フォームと削除依頼の受け口を
Cloudflare Workers + D1 に載せるのが次の段階です（`docs/direction.md` の Phase 2）。

リポジトリには旧 Next.js + Cloudflare 実装が `app/` `lib/` `worker/` などに残っており、
`legacy:` 付きの npm script から動かせます。Phase 2 で Worker を切り出した時点で撤去します。
