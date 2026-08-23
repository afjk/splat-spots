import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SubmitForm } from "./submit-form";

export const metadata: Metadata = {
  title: "Submit a capture — Splat Atlas",
  description: "Add a public Insta360 Spatial Capture URL to the directory.",
};

export default function SubmitPage() {
  return (
    <main>
      <SiteHeader />
      <section className="page-intro submit-intro">
        <p className="eyebrow">CONTRIBUTE / PUBLIC LINKS ONLY</p>
        <h1>Add a place to<br /><em>the spatial web.</em></h1>
        <p>
          一般に共有されたInsta360 Spatial CaptureのURLを登録してください。
          GS3DG IDを安全に抽出し、カタログ用の正規URLへ整えます。
        </p>
      </section>
      <section className="submit-layout">
        <SubmitForm />
        <aside className="submit-aside">
          <p className="eyebrow">BEFORE YOU SUBMIT</p>
          <ol>
            <li><span>01</span><div><b>Public access</b><p>ログインせず開ける共有URLであること。</p></div></li>
            <li><span>02</span><div><b>Clear source</b><p>見つけた投稿や作者が分かる場合は出典を添えること。</p></div></li>
            <li><span>03</span><div><b>Respect removal</b><p>共有解除・削除依頼があれば一覧から外します。</p></div></li>
          </ol>
          <div className="aside-code">
            <span>ACCEPTED PATTERN</span>
            <code>app.insta360.com<br />/3dspace/detail/<strong>GS3DG…</strong></code>
          </div>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
