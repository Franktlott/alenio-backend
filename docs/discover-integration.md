# Discover integration

Alenio Admin and the phone app share one Hono API and one Postgres database per deployment. The phone app does not open Postgres. It calls the same host already set in `EXPO_PUBLIC_BACKEND_URL`, with the existing bearer session (`mobile/src/lib/api/api.ts`).

Publishing in Admin writes a row. The next read of **that same API host** returns the new content. No app rebuild is required for article changes. Dev (`alenio-backend-dev-production.up.railway.app`) and Prod (`alenio-backend-production.up.railway.app`) do not share a database. The phone and Admin must point at the same host.

Responses use `{ data: ... }` and `Cache-Control: private, no-cache`. Refetch when the screen opens. Do not bundle articles into the app.

## Who can read what

Member reads require a signed-in Alenio session. A missing session is `401`. Drafts, archived articles, and scheduled articles whose time has not arrived are omitted from lists and return `404` on detail. The response does not say which of those it was.

An article is live when:

- `status` is `published` and `publishedAt` is at or before now, or
- `status` is `scheduled` and `scheduledAt` is at or before now

Times are UTC. A scheduled article becomes readable on its own when that time arrives. No job has to flip the status.

Admin writes require `accountType = platform_admin` and live under `/api/admin/discover`. Member sessions receive `403`.

## Member endpoints

Send `Authorization: Bearer <token>`.

### Categories

`GET /api/discover/categories`

Active categories only, ordered by `displayOrder`.

```json
{ "data": [{ "id": "", "name": "Reflection", "slug": "reflection", "description": "", "icon": "spark", "displayOrder": 1 }] }
```

### Articles

`GET /api/discover/articles?limit=20`

Live articles, newest first. `limit` is 1–50.

`GET /api/discover/articles?category=reflection&limit=20`

Live articles in one active category.

`GET /api/discover/articles?featured=1&limit=6`

Homepage row. Live articles with `isFeatured`, ordered by `displayOrder`, then newest. If `data` is empty, call the unfiltered list and show the newest articles instead.

`GET /api/discover/articles?category=reflection&featured=category&limit=6`

Articles marked featured inside that category.

Each item:

```json
{
  "id": "",
  "title": "",
  "slug": "",
  "excerpt": "",
  "category": { "id": "", "name": "", "slug": "", "description": "", "icon": null, "displayOrder": 1 },
  "coverImageUrl": "https://...",
  "coverImageAlt": "",
  "readingTimeMinutes": 4,
  "isFeatured": true,
  "featuredInCategory": false,
  "displayOrder": 1,
  "publishedAt": "2026-11-05T18:00:00.000Z",
  "updatedAt": "2026-11-05T18:00:00.000Z"
}
```

`category` is null when the article has no category or that category is inactive. `publishedAt` is the moment the article became readable (`publishedAt` or `scheduledAt`). `coverImageUrl` is an `https` Firebase download URL. Load it directly. Hide the image if it is missing.

### One article

`GET /api/discover/articles/:slug`

Same fields as the list item, plus:

```json
{
  "content": { "type": "doc", "content": [] },
  "senecaEnabled": true,
  "senecaPrompt": "",
  "senecaContext": "",
  "viewCount": 0
}
```

`senecaPrompt` and `senecaContext` are empty unless `senecaEnabled` is true. Pass `senecaContext` into Seneca later. Do not build that chat from this payload alone.

`POST /api/discover/articles/:slug/view`

Increments the view count only when the article is live. Returns `{ "data": { "viewCount": 1 } }`. Call it once when the reader opens. Drafts return `404` and are not counted.

## Article content

`content` is JSON, never HTML. Render only these nodes. Ignore anything else.

- `doc` → `content` array of blocks
- `paragraph` → `content` of inline nodes
- `heading` → `attrs.level` is `2` or `3`
- `bulletList` / `orderedList` → `listItem` → paragraphs
- `blockquote` → paragraphs
- `image` → `attrs.src` must be `https`, `attrs.alt` is optional
- `discoverYoutube` → `attrs.videoId` is an 11-character YouTube id, `attrs.title` is optional accessibility text. Render with `https://www.youtube-nocookie.com/embed/{videoId}` only — never inject arbitrary URLs.
- `text` → `text`, optional marks `bold`, `italic`, or `link`
- `hardBreak`

Links must be `https`. Do not inject the JSON as HTML.

## Admin

`/api/admin/discover` is for the website Admin only. The phone app should not call it.

A platform admin is a separate account (`User.accountType = platform_admin`). Set `PLATFORM_ADMIN_EMAILS` on the API (comma-separated). On startup, existing users with those emails are promoted. This does not create a user and does not add admin to a member from inside the app.

The Admin screens are `/admin/discover`, `/admin/discover/new`, `/admin/discover/:id`, and `/admin/discover/categories`. Member sessions are sent back to Settings.
