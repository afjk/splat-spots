import type { Metadata } from "next";
import Link from "next/link";
import { seedCaptures } from "@/catalog/captures";
import { Gallery } from "@/components/gallery";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Splat Atlas — Public Spatial Capture Directory",
  description: "Discover public Insta360 Spatial Captures and enter them in WebXR.",
};

export default function Home() {
  return (
    <main>
      <SiteHeader />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="live-dot" /> OPEN SPATIAL ARCHIVE / BETA</p>
          <h1>
            Places worth
            <br />
            <em>stepping into.</em>
          </h1>
          <p className="hero-lede">
            一般公開されたInsta360 Spatial Captureを見つけ、整理し、ブラウザやVRヘッドセットから
            そのまま歩ける体験へ。
          </p>
          <div className="hero-actions">
            <Link className="button button-dark" href="#gallery">Explore the atlas <span>↓</span></Link>
            <Link className="text-link" href="/submit">公開URLを追加する ↗</Link>
          </div>
        </div>
        <div className="hero-art" aria-label="Abstract Gaussian splat landscape">
          <div className="coordinate coordinate-a">35.6762° N</div>
          <div className="coordinate coordinate-b">139.6503° E</div>
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="hero-orbit orbit-three" />
          <div className="hero-core"><span>3D</span><small>GAUSSIAN<br />SPACE</small></div>
          <div className="scan-line" />
        </div>
        <div className="hero-stats">
          <div><strong>{seedCaptures.length.toString().padStart(2, "0")}</strong><span>CAPTURES<br />INDEXED</span></div>
          <div><strong>XR</strong><span>QUEST + PICO<br />READY VIEWER</span></div>
          <div><strong>0B</strong><span>CAPTURE DATA<br />MIRRORED</span></div>
        </div>
      </section>
      <Gallery initialCaptures={seedCaptures} />
      <section className="principles">
        <p className="eyebrow">THE DIRECTORY PRINCIPLES</p>
        <h2>The index stays light.<br />The spaces stay with their creators.</h2>
        <div className="principle-grid">
          <article><span>01</span><h3>Public links only</h3><p>登録対象は、すでに一般公開されたInsta360共有URLだけです。</p></article>
          <article><span>02</span><h3>No asset mirroring</h3><p>SOGやPLYは保存せず、閲覧時に公開元から直接読み込みます。</p></article>
          <article><span>03</span><h3>Creator control</h3><p>共有解除を尊重し、所有者からの削除依頼を受け付けます。</p></article>
        </div>
      </section>
      <section className="submit-banner">
        <div>
          <p className="eyebrow">FOUND A PUBLIC SPACE?</p>
          <h2>Help map the spatial web.</h2>
        </div>
        <Link className="button button-light" href="/submit">Submit a capture <span>↗</span></Link>
      </section>
      <SiteFooter />
    </main>
  );
}
