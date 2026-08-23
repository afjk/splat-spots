import Link from "next/link";
import { viewerUrl } from "@/lib/viewer/adapter";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand">SPLAT ATLAS</div>
        <p>Public spatial captures, indexed for the open web and WebXR.</p>
      </div>
      <div className="footer-links">
        <Link href="/submit">Submit</Link>
        <a href={viewerUrl()} target="_blank" rel="noreferrer">
          Viewer sample
        </a>
        <Link href="/report">Report / Remove</Link>
      </div>
      <p className="disclaimer">
        非公式サイトです。Insta360およびその関連会社とは提携していません。掲載するのは公開ページの
        メタデータとリンクのみで、SOG / PLYデータを恒久保存・再配布しません。
      </p>
    </footer>
  );
}
