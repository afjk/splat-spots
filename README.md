# Splat Atlas

Public Insta360 Spatial Capture directory and WebXR viewer companion app.

The directory stores public share metadata only. Capture assets (`.sog`, `.ply`,
camera JSON, and signed asset URLs) stay remote and are never permanently
mirrored by this app.

## MVP routes

- `/` — searchable gallery of public captures
- `/submit` — normalizes a share URL, checks public SOG availability, and stores the catalog row
- `/s/:id` — embeds and launches the existing XR viewer with `?id=GS3DG…`
- `/report` — stores owner correction/removal requests in a private review queue
- `/api/captures` — catalog `GET` and normalized submission `POST`

## Viewer integration

The default viewer is the
[`afjk/insta360-sog-xr-viewer`](https://github.com/afjk/insta360-sog-xr-viewer)
deployment on [GitHub Pages](https://afjk.github.io/insta360-sog-xr-viewer/).
It accepts a stable public share ID in the `id` query parameter:

```text
https://afjk.github.io/insta360-sog-xr-viewer/?id=GS3DG…
```

Set `NEXT_PUBLIC_VIEWER_BASE_URL` to point the directory at another deployment.
The adapter is isolated in `lib/viewer/adapter.ts`. Calling it without an ID
returns the viewer base URL unchanged, so the viewer's existing `capture.sog`
default sample behavior remains intact.

## Catalog and persistence

- `catalog/captures.ts` is the small, reviewable seed catalog.
- D1 stores submissions using the schema in `db/schema.ts`.
- `lib/captures/repository.ts` is the persistence boundary.
- `lib/discovery/` defines candidate and importer boundaries for future search
  engine or X discovery. Discovery providers cannot write directly to storage.
- `lib/verification/` checks current public availability without retaining the
  signed SOG URL returned by Insta360.
- `.openai/hosting.json` declares the logical `DB` binding.

All catalog records use these fields:

```text
id, insta360_url, title, description, source_post_url, source_author,
discovered_at, last_checked_at, status, tags
```

## Development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
```

Generate a migration after changing the catalog schema:

```bash
npm run db:generate
```

## Deliberately out of scope

- broad crawling or ID enumeration
- permanent SOG/PLY mirroring
- moderation and owner-verification workflow
- rate limiting and abuse prevention
