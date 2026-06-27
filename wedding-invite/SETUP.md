# Rohit & Aditi — Wedding Invite + RSVP + Admin Dashboard

A private, per-guest wedding invitation with RSVP and an admin dashboard, hosted
as a subpage of your GitHub Pages site. No passwords for guests, no servers to
run, no monthly cost.

- **Guest invite:** `wedding-invite/index.html` → `rohitgandikota.github.io/wedding-invite/?t=<token>`
- **Admin dashboard:** `wedding-invite/admin/index.html` → `rohitgandikota.github.io/wedding-invite/admin/`
- **Backend + database:** one Google Sheet + `apps-script/Code.gs`

Each guest gets a unique link. The page looks up their name in the Sheet, greets
them by name (read-only — they can't type someone else's), and lets them RSVP.
Re-opening the link shows their saved answer; submitting **overwrites only their
own row**.

> Trade-off you accepted: no login, so the link itself is the key. It's long and
> random (not guessable, not searchable). A forwarded link could let someone RSVP
> as that guest — you'll see every response in the dashboard and can fix it.

---

## Step 1 — Create the guest Sheet

1. New Google Sheet → rename the tab to **`Guests`**.
2. In **row 1**, paste these 18 headers across columns A–R (exact spelling):

   `Name` · `Email` · `WhatsApp` · `PartySize` · `Side` · `Invited` · `Token` · `InviteLink` · `WhatsAppSend` · `EmailSend` · `Status` · `Guests` · `Events` · `Meal` · `Song` · `Message` · `InviteMessage` · `RespondedAt`

   > **Already created the sheet earlier?** Just add any missing headers — **`Side`**,
   > **`Invited`**, **`InviteMessage`** — in the next empty columns. Columns are matched
   > by name, so they can go anywhere. `Side` is Bride & Groom / Groom's side / Bride's
   > side. Blank `Invited` = invited to everything. `InviteMessage` is filled
   > automatically and powers the dashboard's per-guest "Copy message" button.
   > **Location** (Patna = Sangeet & Wedding, Palasamudram = Reception) is computed from
   > events — no column needed.

3. Add guests — you only fill the **first four** columns:
   - **Name** — shown to the guest ("Dear ___"). e.g. `Priya & Arjun`
   - **Email** — optional (blank for WhatsApp-only guests)
   - **WhatsApp** — international digits only, **no `+`, spaces, or dashes**. e.g. `919876543210`
   - **PartySize** — max people allowed on this invite (e.g. `2`). Caps the guest counter.

   Leave `Token` → `RespondedAt` blank — they fill automatically.

## Step 2 — Add the backend script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the boilerplate, paste all of `apps-script/Code.gs`.
3. **Near the top, change `ADMIN_KEY`** to your own long random string — **do this
   here in the Apps Script editor, not in the repo's `Code.gs` file.** Apps Script
   runs on Google's servers and is never public, so your real key stays private.
   Leave the placeholder in the repo copy; never commit your real key.
4. **Save**, then reload the Sheet — you'll see a **💍 Wedding** menu.

## Step 3 — Deploy as a Web App

1. Apps Script editor → **Deploy → New deployment** → gear → **Web app**.
2. **Execute as:** Me · **Who has access:** **Anyone**.
3. **Deploy**, approve permissions, copy the **`/exec` URL**.

> Your `/exec` URL is already pasted into both `index.html` and `admin/index.html`.
> If you ever **re-deploy** after editing `Code.gs`, use **Manage deployments →
> Edit (pencil) → New version** to keep the **same URL** (otherwise you must paste
> the new URL into both files).

## Step 4 — Publish

```bash
cd rohitgandikota.github.io
git add wedding-invite
git commit -m "Add Rohit & Aditi wedding invite, RSVP, and admin dashboard"
git push
```

Live within a minute at `https://rohitgandikota.github.io/wedding-invite/`.

## Step 5 — Add guests & send invites

**Easiest — from the dashboard (no spreadsheet needed):**
Open the admin dashboard, click **＋ Add guest**, fill Name / Email / WhatsApp /
Party size, and hit **Create invite**. It writes the guest to your Sheet, mints
their personal link, and shows a ready **copy-paste invite message** plus
**Open in WhatsApp** / **Open Email** buttons. Use **Add another** to keep going.

**Or in bulk from the Sheet:**
1. Type guests' Name / Email / WhatsApp / PartySize into rows.
2. **💍 Wedding → 1 · Generate tokens & links** fills **InviteLink**,
   **WhatsAppSend** (`wa.me`), **EmailSend** (`mailto`) for each new row.
3. **💍 Wedding → 2 · Show who hasn't responded** lists everyone still pending.

## Step 6 — Watch RSVPs roll in

Open `https://rohitgandikota.github.io/wedding-invite/admin/`, enter your
**ADMIN_KEY**, and you get:
- Live counts (invited / attending / declined / pending / total headcount)
- A response donut + per-event and meal-preference bars
- A searchable, filterable guest table with one-tap reminder links
- **Export CSV** for the caterer / planner

The key is remembered on your device; **Lock** clears it.

---

## What the guest RSVP collects
Accept/decline · which events (Sangeet / Wedding / Reception) · number of guests
(capped at their PartySize) · meal preference · a song request · a note. All of it
shows up in the Sheet and the dashboard.

## Privacy notes
- Both pages carry `noindex`; don't link to them publicly.
- Guest names/contacts live only in your private Sheet, never in the public repo.
- The dashboard is useless without the `ADMIN_KEY`. Treat that key like a password;
  to rotate it, change `ADMIN_KEY` in `Code.gs`, re-deploy (same URL), and re-enter.
