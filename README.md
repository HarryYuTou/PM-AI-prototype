# ShelfCheck — Library Board Game Return Checks

A web prototype for checking the components of individual library board game copies. It implements the core workflow defined in the PRD: **set up a copy → photograph its returned contents → confirm each component count → mark ready to shelve or hold for follow-up → save the check**.

## Run locally

Use Node.js 26 or later. The project was verified with Node.js 26.8.1. The application has no third-party runtime dependencies.

```sh
npm run dev
```

Open <http://localhost:4173> in your browser. The server listens only on the local machine. If the port is already in use, run `PORT=4174 npm run dev`.

### Configure an Anthropic API key

In the `.env` file at the project root, enter your key after the equals sign:

```dotenv
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

The `.env` file is hidden. In macOS Finder, press `Command + Shift + .` to show hidden files. Git ignores this file; never commit a real API key. After cloning the repository, copy `.env.example` to `.env` and enter your key there.

Both `npm run dev` and `npm start` load `.env` at startup. Restart the server after changing it. **This only prepares the configuration: the image recognition API is not connected yet, and entering a key does not trigger API calls or charges.** The offline HTML preview neither includes nor reads this file.

To run the checks and tests, first install the development dependencies:

```sh
npm ci
npm run check
npm test
```

To generate a standalone offline preview:

```sh
npm run build
```

The output is `dist/index.html`, with styles, scripts, and sample illustrations embedded. You can try opening it directly in a browser. If the browser restricts IndexedDB for local files, use the HTTP server described above. The two preview methods do not share stored data.

## Implemented features

- **Copy setup:** game name, unique barcode, reference photo, component groups and expected quantities, manual-count flags, and confirmation of the complete inventory.
- **Copy lookup:** a barcode input and a sidebar list of copies. The input supports simulated barcode entry; camera-based barcode scanning is not implemented.
- **Return photos:** upload or drag in JPG, PNG, or WebP images up to 12 MB. Images are resized to a maximum long edge of 1800 px and stored locally. Switch between return and reference images or enlarge them for inspection.
- **Review checklist:** expected quantities, suggested recognition counts, staff-verified counts, and statuses for matching counts, possible shortages, extra pieces, or uncertain counts.
- **Staff confirmation:** every component group requires a valid count and explicit confirmation. Editing a count clears that group's confirmation. A copy can be marked ready to shelve only when every count matches. Missing pieces can be recorded by holding the copy for follow-up. A hold without a shortage requires a reason.
- **Saved records:** copy barcode, game name, timestamp, return photo, an inventory snapshot, staff-confirmed counts, missing quantities, notes, and final disposition.
- **Check history:** view previous checks, missing pieces, and saved return photos for the selected copy.
- **Validation and error handling:** duplicate barcodes, invalid counts, unsupported or oversized images, image decoding errors, storage failures, duplicate submissions, and warnings before discarding an unsaved check.

## Image recognition placeholder

The integration entry point is `recognizeComponents()` in `src/recognition.js`.

**The current prototype does not call a recognition service or analyze images.**

- **Harbor Trail / SC-001** is a fictional sample copy. Its tray images are illustrations, not real photographs.
- Fixed demo results are available only when using this sample copy with its built-in illustrations. The three scenarios are a complete game, one missing pawn, and overlapping tiles.
- Cards require a manual count in every demo scenario; a stack of cards does not reveal its quantity.
- Uploading any real photo leaves all recognition counts unknown and opens a manual review. Demo results are never applied to uploaded photos.
- Staff can correct every suggested count. The application preserves the distinction between the initial suggestion and the verified count.

For a future API integration, the browser should send the return photo, the copy's reference photo, and its confirmed inventory to the server. The server should call a vision model and return each component ID, visible count (`null` when unknown), and an explanation. **Expected quantities must continue to come from the inventory confirmed by staff during setup.**

```json
{
  "components": [
    { "id": "pawns", "count": 3, "note": "Only three unobscured pawns are visible." },
    { "id": "cards", "count": null, "note": "Stacked cards require a manual count." }
  ]
}
```

Integration will also require a server-side API route, timeout and error handling, and interface labels for live recognition. API keys must remain in server-side environment variables and must never appear in `src/`, browser code, or the Git repository. Currently, `server.mjs` only serves static files.

## Data and scope

- Copies and check records are stored in **the current browser's IndexedDB** and persist across page refreshes.
- Data is not shared across browsers, devices, domains, or ports. Clearing site data removes the records. This is not a shared multi-user database.
- The prototype does not include borrower identities, catalog integration, damage assessment, automatic shelving decisions, notifications, or fines.
- Implementation follows the PRD's Product Scope. Automatic borrower association and condition records mentioned in the JTBD section are outside this prototype's scope.
- A photo can only support checks of visible components. Card decks, obscured pieces, and large sets of small components require manual counting.

## Verification coverage

Automated checks cover business rules, the application's DOM event flows, transaction handling in the persistence adapter, and static file routes. DOM tests use jsdom, with test doubles for storage and image decoding. They do not replace real-browser testing of camera input, image decoding, IndexedDB persistence, or visual layout.

The development environment blocked local HTTP listeners and browser access to local file previews, so **automated real-browser visual and persistence acceptance checks could not be completed there**. Start the application from a regular terminal and follow `ACCEPTANCE.md` for browser acceptance testing.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` / `styles.css` | Page entry point, responsive layout, and visual styles |
| `src/app.js` | Rendering, forms, photo uploads, and the check-in workflow |
| `src/domain.js` | Inventory validation, count comparisons, final decisions, and record snapshots |
| `src/recognition.js` | Recognition placeholder and fixed demo scenarios |
| `src/storage.js` | IndexedDB storage for copies and check records |
| `src/images.js` | Upload validation, resizing, and local image processing |
| `src/seed.js` / `assets/` | Fictional sample inventory and illustrations |
| `server.mjs` | Static development server accessible only from the local machine |
| `tests/` | Business rules, DOM workflows, storage adapter, and route tests |

