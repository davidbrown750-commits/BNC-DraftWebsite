# Lobby Sign submissions — setup

Staff post to the reception screen from `https://www.berkeleynucleonics.com/lobby`.
Nothing reaches the screen until an approver releases it.

```
/lobby  ->  POST /api/lobby        (Clerk, @berkeleynucleonics.com only)
              -> bnc_lobby_posts   status = pending
        ->  approver releases it   status = approved
the sign ->  GET /api/lobby-feed?k=KEY   returns approved, unexpired posts only
```

## Files

| Path | What it is |
|---|---|
| `lobby/index.html` | The submission page. Served at `/lobby`, no rewrite needed. |
| `api/lobby.js` | Submit, list, approve, decline, remove. Clerk-gated. |
| `api/lobby-feed.js` | Read-only feed for the sign. Key-gated, never returns emails. |
| `vercel.json` | Two `X-Robots-Tag: noindex, nofollow` headers for `/lobby`. |

The page is deliberately **not** in `sitemap.xml` or `llms.txt`, and nothing links to it
from public navigation.

## 1. Database

Run in the Supabase SQL editor.

```sql
create table if not exists bnc_lobby_posts (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  kind           text not null check (kind in ('announcement','shoutout','photo','riddle')),
  title          text not null,
  detail         text,
  answer         text,
  image_url      text,
  until          date,
  status         text not null default 'pending'
                 check (status in ('pending','approved','declined','removed')),
  author_email   text not null,
  author_name    text,
  reviewed_by    text,
  reviewed_at    timestamptz,
  decline_reason text
);

-- The feed reads this filter on every poll.
create index if not exists bnc_lobby_posts_live_idx
  on bnc_lobby_posts (status, created_at desc);
create index if not exists bnc_lobby_posts_author_idx
  on bnc_lobby_posts (author_email, created_at desc);

-- Same posture as the other bnc_ tables: RLS on with no policies, so only the
-- service-role key used by the API can read or write it.
alter table bnc_lobby_posts enable row level security;
```

## 2. Photo storage

Create a storage bucket named **`lobby`** and mark it **public**. The sign is a browser
in reception with no session, so it has to be able to load the image by URL. Only
approved photos are ever handed out by the feed, but treat the bucket as public: do not
put anything in it you would not put on the wall.

Uploads are capped at 3 MB server-side and the browser downscales to 1600px / JPEG 82
before sending, so a phone photo arrives around 200-400 KB.

## 3. Environment variables (Vercel)

Already present, reused as-is:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

New:

- `LOBBY_FEED_KEY` — long random string. The sign puts it on the URL. Without it
  `/api/lobby-feed` returns 503 rather than defaulting open.
- `LOBBY_APPROVERS` — optional, comma-separated emails who can approve. Defaults to
  `david.brown@berkeleynucleonics.com, davidbrown750@gmail.com`.

Generate a key with:

```
python -c "import secrets;print(secrets.token_hex(16))"
```

## 4. Who can do what

Posting requires a Clerk session on a `@berkeleynucleonics.com` address. The three
outside collaborators already treated as staff on www (`davidbrown750@gmail.com`,
`jsaldi@regencyinteractive.com`, `rcabe@regencyinteractive.com`) can post too, matching
`employee-portal.html`. Approving requires being on `LOBBY_APPROVERS`.

Anyone can withdraw their own post. An approver can pull anything.

Unlike `/api/internal-doc`, this endpoint does **not** fall back to "a valid Clerk
session is good enough" when the token carries no email claim. It writes to a screen
customers can see, so an unidentifiable session is refused.

## 5. Connecting the sign

The sign polls `GET /api/lobby-feed?k=LOBBY_FEED_KEY` and gets:

```json
{
  "ok": true,
  "generated_at": "2026-08-04T19:00:00.000Z",
  "counts": { "announcements": 2, "shoutouts": 1, "photos": 0, "riddles": 3 },
  "announcements": [ { "id": "...", "t": "Headline", "d": "Detail", "by": "Name", "until": "2026-09-03" } ],
  "shoutouts":     [ ... ],
  "photos":        [ { "src": "https://.../lobby/....jpg", "t": "Caption", ... } ],
  "riddles":       [ { "id": "...", "q": "The riddle", "a": "The answer", "by": "Name" } ]
}
```

Expiry is applied by the feed, so a post with `until` in the past simply stops being
returned. The sign does not need its own date logic for submitted items.

**The sign has to be able to make that request.** While it runs as a claude.ai artifact
it cannot: artifacts run under a strict CSP and the only runtime capabilities available
are `downloads` and `mcp`, neither of which reaches a BNC endpoint. Host the sign's
standalone build and point the reception TV at that instead. See
`active-projects/Fun Board/brief.md` in the Founder OS repo.
