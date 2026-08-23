import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="Splat Atlas home">
        <span className="brand-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>SPLAT ATLAS</span>
      </Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/#gallery">Explore</Link>
        <Link href="/submit">Submit</Link>
        <a href="https://github.com/afjk/insta360-sog-xr-viewer" target="_blank" rel="noreferrer">
          Viewer ↗
        </a>
      </nav>
      <Link className="header-submit" href="/submit">
        <span>＋</span> Add a capture
      </Link>
    </header>
  );
}
