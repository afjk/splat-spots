import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isCaptureId } from "@/lib/captures/normalize";
import { ReportForm } from "./report-form";

export const metadata: Metadata = {
  title: "Report or remove — Splat Atlas",
  description: "Request a correction or removal from the Splat Atlas directory.",
};

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string }>;
}) {
  const { capture } = await searchParams;
  const initialCapture = capture && isCaptureId(capture) ? capture : "";

  return (
    <main>
      <SiteHeader />
      <section className="page-intro report-intro">
        <p className="eyebrow">CREATOR CONTROL / REPORT &amp; REMOVE</p>
        <h1>Keep the atlas<br /><em>respectful.</em></h1>
        <p>
          Captureの作者・所有者からの削除依頼、掲載情報の修正、共有解除の報告を受け付けます。
          申請内容は公開されず、確認用キューに保存されます。
        </p>
      </section>
      <section className="report-layout">
        <ReportForm initialCapture={initialCapture} />
        <aside className="report-aside">
          <p className="eyebrow">WHAT HAPPENS NEXT</p>
          <div><span>01</span><p>申請を非公開の確認キューへ保存します。</p></div>
          <div><span>02</span><p>公開状態や所有関係を確認します。</p></div>
          <div><span>03</span><p>必要に応じて修正または一覧から非表示にします。</p></div>
          <small>このフォームはInsta360上の共有設定を変更するものではありません。</small>
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
