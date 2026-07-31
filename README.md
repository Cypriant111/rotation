# Rotation

Your Apple Music listening stats, on your iPhone home screen.

Rotation is a small installable web app (PWA) that tracks what you listen to on
Apple Music and turns it into stats: minutes listened, plays, top artists /
songs / albums, a listening-clock heatmap, streaks, skip analytics, and
shareable recap cards. Everything is stored on your device - there is no
backend and no account.

The **Mixes** tab distills the data into playlist-shaped lists of what you
actually like: *Heavy Rotation* (recency-weighted plays, corrected by how often
you finish the song and how many separate days you reached for it), *On the
Rise* (surging against your own baseline), *Old Flames* (heavily played, gone
quiet for 60+ days), and *No Skips* (never once cut short - appears when skip
data exists, i.e. after a CSV import). Each mix can be copied or shared as
"Artist - Song" lines (playlist-importer Shortcuts read that format), and each
row opens the song in Apple Music.

## How it gets your listening data

Apple doesn't offer a listening-history API, so Rotation combines two sources:

1. **Last.fm (automatic, ongoing).** The free Last.fm iPhone app records
   ("scrobbles") your Apple Music plays; Rotation pulls them from the Last.fm
   API every time you open it.
2. **Apple privacy export (deep history).** Apple will send you CSVs of your
   full play history since ~2015; Rotation imports them locally and merges
   them with the Last.fm data (duplicates are detected and skipped).

## Install on your iPhone

1. Open the deployed app in Safari.
2. Tap the share button, then **Add to Home Screen**.
3. **Open the installed app** and do your setup there - iOS gives the
   installed app its own separate storage, so anything you set up in the
   Safari tab does not carry over.

## Set up automatic tracking (Last.fm)

One-time, roughly five minutes:

1. Create a free account at [last.fm/join](https://www.last.fm/join).
2. Install the **Last.fm** app from the App Store and sign in.
3. In iPhone **Settings ▸ Music**, turn on **Use Listening History**. Give the
   Last.fm app access to Apple Music when it asks, and allow Background App
   Refresh.
4. While signed in on last.fm, open
   [last.fm/api/account/create](https://www.last.fm/api/account/create), enter
   any application name, submit, and copy the **API key**.
5. In Rotation's Settings tab, enter your username and that API key, then
   Connect. Your whole scrobble history is imported on first sync.

Heads-up: iOS doesn't let any app watch Apple Music in real time. The Last.fm
app reads your play history when it runs, so open it every day or two to keep
scrobbles flowing. (Paid alternative: Marvis Pro with its Last.fm add-on
scrobbles in real time because it *is* the player.)

## Import your full Apple Music history

1. Go to [privacy.apple.com](https://privacy.apple.com) ▸ *Get a copy of your
   data* ▸ select **Apple Media Services information**.
2. Apple prepares the archive within about a week and emails you.
3. Unzip it, open the **Apple Music Activity** folder, and import
   **`Apple Music - Play History Daily Tracks.csv`** in Rotation's Settings
   tab. (The larger `Apple Music Play Activity.csv` is also supported; note
   that 2026-era exports of that file no longer include an artist column, so
   the daily-tracks file gives better results.)

The file is parsed entirely on your device and never uploaded.

## Development

```bash
npm install
npm run dev        # dev server at http://localhost:5173/rotation/
npm test           # vitest unit tests (stats engine, parsers)
npm run build      # production build to dist/
npm run icons      # regenerate PWA icons from the SVG master
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
The Vite `base` is `/rotation/`; if you fork under a different repo name,
change `base` in `vite.config.ts` and the icon/start_url paths in
`index.html` / the PWA manifest accordingly.

## Privacy

- All listening data lives in IndexedDB on your device.
- The only network calls are to the Last.fm API (your scrobbles, with your own
  API key) and Last.fm's image CDN for album artwork.
- Settings ▸ Data lets you export everything as JSON or delete it per source.
