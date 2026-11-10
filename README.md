# Docs Outline Panel

A Chrome extension that replaces the Google Docs outline sidebar with a
resizable panel that shows full heading text.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder (`gdocs-toc`).
4. Reload any open Google Docs tabs.

After editing the code, click the reload icon on the extension's card in
`chrome://extensions`, then reload the Docs tab.

## Use

- **Resize**: drag the panel's right edge. Double-click the edge, or click ↔,
  to fit the width to the longest heading.
- **Wrap** (↵): switch between wrapped headings and one line per heading.
- **A− / A+**: text size.
- **1 / 2 / 3 / All**: how many heading levels to show.
- **▼ / ▶**: collapse or expand one section.
- **Filter headings**: show only headings containing the text you type.
- **✕**: hide the panel and get the normal Docs sidebar back. Click the
  **Outline** button at the bottom left to reopen it.

Width, wrap, text size and level are remembered across all your docs.

## How it works

Docs draws the document on a canvas, so headings can't be read from the page.
The native outline sidebar is ordinary HTML though, and holds every heading's
full text. The extension keeps that sidebar in the page but invisible, mirrors
its entries into its own panel, and replays your clicks on the native entries
so Docs does the scrolling. It uses no Google API and no permissions.

When the panel is wider than the native sidebar, the page is moved right with
CSS (`page.css`). Docs only re-centres the page during its own layout pass, so
after a resize the extension briefly toggles the native sidebar to start one.

## If it breaks

Google can change Docs' HTML at any time. Everything that depends on it is in
the `SEL` object at the top of `content.js` and in `page.css`.
