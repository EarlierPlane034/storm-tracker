# Background Push Alerts — Cloudflare Worker Setup

This gets StormLens sending real notifications to your iPhone **even when
the app is fully closed**. One-time setup, about 10 minutes, $0 — the free
Cloudflare plan covers it comfortably.

Prerequisites: a free Cloudflare account, StormLens installed to your
Home Screen, iOS 16.4 or newer.

## Part 1 — Create the worker (Cloudflare dashboard)

1. Log in at **dash.cloudflare.com**
2. In the left sidebar choose **Workers & Pages** (sometimes under "Compute")
3. Click **Create** → **Create Worker** (choose the "Hello World" starter if asked)
4. Name it `stormlens-push` → click **Deploy**
5. Click **Edit code** — you'll see a code editor with sample code
6. Delete everything in the editor and paste the entire contents of
   [`cloudflare/worker.js`](../cloudflare/worker.js) from this repository
   (on GitHub: open the file → the "copy raw file" button copies it all)
7. Click **Deploy** (top right)

## Part 2 — Give the worker storage (KV)

The worker needs a small key-value store to remember your phone.

1. In the left sidebar: **Storage & Databases** → **KV**
2. **Create a namespace** → name it `stormlens-push` → Create
3. Go back to your worker (**Workers & Pages** → `stormlens-push`)
4. Open its **Settings** tab → **Bindings** (or "Variables and Bindings")
5. **Add binding** → type **KV namespace**
   - Variable name: `SUBS`  ← must be exactly this
   - KV namespace: pick the `stormlens-push` namespace you just made
6. Save (the worker may redeploy — that's fine)

## Part 3 — Make it check every minute (cron)

1. Still in your worker's **Settings** tab, find **Triggers** → **Cron Triggers**
2. **Add Cron Trigger** and enter exactly:

   ```
   * * * * *
   ```

3. Save. That's "every minute."

## Part 4 — Connect your phone

1. Your worker's URL is shown on its overview page — it looks like
   `https://stormlens-push.YOURNAME.workers.dev`. Copy it.
2. Open **StormLens from your Home Screen icon** (not in Safari)
3. Go to **Settings → Background alerts** → paste the URL → **Connect**
4. Allow notifications when iPhone asks
5. You should see "✅ Background alerts are ON"

Test it: visit `https://stormlens-push.YOURNAME.workers.dev/` in any
browser — you should see `"subscribers": 1`.

## How it works / good to know

- The worker checks NWS alerts every minute and pushes ones that are
  inside or near your last known location **and your saved favorites**.
- Your alert toggles (Settings → Notifications) and monitoring radius are
  respected — StormLens re-syncs them to the worker automatically, and
  updates your location whenever you move ~12+ miles.
- Each alert notifies once per place (no spam); records expire after 6 h.
- Privacy: your location is stored only in **your own** Cloudflare
  account's KV store, readable only by your worker.
- Optional: edit the `CONTACT` line at the top of the worker code to your
  real email (it's a standard courtesy field for push services; nothing is
  sent to it).

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Couldn't connect to the push worker" | Check the URL; make sure Part 2's binding is named exactly `SUBS` |
| Connected but no notifications | Confirm the cron trigger exists (Part 3); check iPhone Settings → Notifications → StormLens is allowed |
| Worker page shows an error about SUBS | The KV binding is missing or misnamed — redo Part 2 |
| Notifications stopped after reinstalling the app | Reconnect in Settings → Background alerts (reinstalls get a new push address) |

⚠️ StormLens push is a smart second opinion — keep iPhone **Government
Alerts** enabled (Settings → Notifications, bottom of the page) as your
primary life-safety alarm.
