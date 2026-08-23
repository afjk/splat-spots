import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

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
  return (
    <main>
      <SiteHeader />
      <section className="simple-page">
        <p className="eyebrow">CREATOR CONTROL / PLACEHOLDER</p>
        <h1>Report or<br /><em>remove a listing.</em></h1>
        <p>
          正式な削除依頼フォームは次の段階で追加します。MVPでは、対象IDを控えたうえで
          管理者窓口へ連絡できる導線を用意しています。
        </p>
        <div className="report-record">
          <span>CAPTURE ID</span>
          <code>{capture || "Not specified"}</code>
        </div>
        <p className="small-note">共有解除が確認できたCaptureは、カタログ上で unavailable として非表示にします。</p>
        <Link className="button button-dark" href={capture ? `/s/${capture}` : "/"}>Return to capture <span>←</span></Link>
      </section>
      <SiteFooter />
    </main>
  );
}
