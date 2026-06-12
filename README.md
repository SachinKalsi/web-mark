# Web Mark – Chrome Extension

Highlight text on any webpage in different colours and take page-level notes. Data is stored in the browser for fast access and can be synced to Google Sheets for backup and use on other devices.
<img width="1039" height="423" alt="image" src="https://github.com/user-attachments/assets/75cf69e0-8ed5-4682-bc66-32d7dd125ebb" />



## Features

- **Highlight text**: Select text on any page; it is highlighted with the currently chosen colour. Highlights persist when you revisit the page.
- **Page-level notes**: Click the extension icon to open the popup and view/edit notes for the current page.
- **Storage**: Data is stored in `chrome.storage.local` (browser) and can be synced to a Google Sheet (one spreadsheet per user, created on first sync).

## Installation

1. Clone or download this folder.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select this folder (e.g. `web-mark` or your repo name).

For **Sync to Google Sheets**, edit `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your Google OAuth Client ID (see Google Sheets setup below).

## Google Sheets setup (required for Sync / Import)

To use **Sync to Google Sheets** and **Import from Google Sheets**, you must configure OAuth.  
If you see **“Access blocked: chrome-extension has not completed the Google verification process”**, see the section **Avoid “Access blocked”** below.

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Enable the **Google Sheets API**: APIs & Services → Library → search “Google Sheets API” → Enable.
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → **OAuth client ID**.
   - Application type: **Chrome app**.
   - Name it (e.g. “Web Mark”).
   - You will need your extension ID: go to `chrome://extensions/`, find Web Mark, and copy the **ID** (e.g. `abcdefghijklmnop`).
   - In the OAuth client creation screen, paste that ID under “Application ID” (or similar, depending on UI).
5. Copy the **Client ID** (looks like `123456789-xxx.apps.googleusercontent.com`).
6. Edit **`manifest.json`**: find `oauth2` → `client_id` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your full Client ID.  
   **Before pushing to GitHub**, change it back to `YOUR_CLIENT_ID.apps.googleusercontent.com` so you don’t commit your real ID.

After that, the first time you click **Sync to Google Sheets** in the popup, Chrome will ask you to sign in to Google and allow the extension to access spreadsheets. The extension will create a spreadsheet named “Web Mark” (or use an existing one if you set its ID in Options).

### Avoid “Access blocked: chrome-extension has not completed the Google verification process”

Google blocks unverified apps by default. For **personal use** (or a small number of users), you can run the app in **Testing** mode so only you (and up to 100 test users) can sign in without verification:

1. In [Google Cloud Console](https://console.cloud.google.com/), select your project.
2. Go to **APIs & Services** → **OAuth consent screen**.
3. Set **User type** to **External** (if not already), then click **Save**.
4. Under **Publishing status**, ensure it says **Testing**. If it says “In production”, click **Back to testing** (or change **Publishing status** to **Testing**). In Testing mode, only test users can use the app.
5. Scroll to **Test users**. Click **+ ADD USERS** and add the **Google account email(s)** that will use this extension (e.g. your Gmail). Click **Save**.
6. When you click **Sync to Google Sheets** in the extension, Google may still show “This app isn’t verified”. Click **Advanced** → **Go to Web Mark (unsafe)** to continue. This is safe for your own app and test users.

**Summary**: Keep the OAuth consent screen in **Testing** and add your email as a **Test user**. Then use “Advanced” → “Go to … (unsafe)” when Google shows the unverified-app warning.

### How to refer to your spreadsheet and sheet names

- **Spreadsheet ID**: In the spreadsheet URL, the ID is the long string between `/d/` and `/edit`:
  - URL: `https://docs.google.com/spreadsheets/d/1ABC...xyz/edit`
  - **Spreadsheet ID**: `1ABC...xyz` — paste this in the extension **Options** page in the **Google Spreadsheet ID** field (see **Options** section below for how to open Options).
- **Sheet names**: The extension uses two tabs inside the spreadsheet:
  - **Highlights** – one row per highlight (URL, highlightId, highlightedText, startXPath, startOffset, endXPath, endOffset, color, createdAt). Only highlights with captured text are synced; those without text are removed from storage on sync.
  - **PageNotes** – one row per page note (URL, noteId, content, createdAt).
- In **Options** you can set **Sheet name for highlights** and **Sheet name for notes** if your spreadsheet uses different tab names (e.g. “My Highlights”, “My Notes”). Leave them at the defaults if you use “Highlights” and “PageNotes”.

## Usage

- **Enable highlighting**: In the popup, turn on **“Enable text highlighting”**, or press **Cmd+Shift+L** (Mac) / **Ctrl+Shift+L** (Windows/Linux) to toggle. When it is off, selecting text does not create or sync highlights. When on, the extension icon shows a green **ON** badge.
- **Highlight**: With highlighting enabled, select text on a page; it is highlighted with the default colour. Change the colour in the popup before selecting if you want a different colour.
- **Delete or change a highlight**: Right‑click the highlighted text → **Remove highlight** or **Change color** (pick a colour). After removing highlights, click **Sync to Google Sheets** so the sheet is updated (removed highlights disappear from the sheet).
- **Notes**: Click the extension icon → edit “Notes for this page” → click **Save notes**.
- **Sync**: Click **Sync to Google Sheets** to upload all local highlights and notes. Only “content” URLs are synced; the following are excluded: sign‑in pages (e.g. accounts.google.com), Google Cloud Console, and Google Sheets pages (docs.google.com/spreadsheets/…). Click **Import from Google Sheets** to replace local data with the sheet (e.g. on a new device).

## Options (where to set Google Spreadsheet ID, sheet names, default colour)

**Where to open Options:** In Chrome, find the **Web Mark** icon in the toolbar (top right, next to the address bar). **Right‑click** the icon and choose **Options** from the menu. A new tab opens with the extension’s settings.

If you don’t see the icon, click the **puzzle piece** (Extensions) in the toolbar and pin **Web Mark** so its icon appears.

On the Options page you can set:

- **Default highlight colour** – colour used when you highlight text.
- **Google Spreadsheet ID** – paste the spreadsheet ID from your Google Sheet URL to use that file for Sync/Import. Leave blank to let the extension create a new spreadsheet on first sync.
- **Sheet name for highlights** / **Sheet name for notes** – tab names inside the spreadsheet (defaults: “Highlights” and “PageNotes”).

## Where to set things

| What you're setting | Where | What to do |
|---------------------|--------|------------|
| Google OAuth Client ID (for Sync/Import) | **`manifest.json`** | Edit `oauth2` → `client_id`; replace the placeholder with your Client ID. Before pushing to GitHub, change it back to the placeholder. |
| Spreadsheet ID, sheet names, default colour | Extension **Options** (right‑click icon → Options) | Use the Options page; no file edit needed. |

## File structure

- `manifest.json` – Extension manifest. Edit `client_id` for Google Sheets; use placeholder before pushing to GitHub.
- `background.js` – Service worker: storage, messaging, Google Sheets sync/import.
- `content.js` / `content.css` – Content script: selection → highlight, restore on load.
- `popup/` – Popup UI (colour picker, notes, sync buttons).
- `options/` – Options page (default colour, optional Sheet ID).
- `lib/xpath.js` – XPath helpers to persist and restore highlight positions.
- `lib/storage.js` – Storage helpers (used by background).
- `icons/` – Extension icons (replace with your own if desired).
