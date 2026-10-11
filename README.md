# Cascade

A complete Draw Three Klondike solitaire for the browser. Build four foundations
from Ace to King on a quiet felt table, then watch every card launch, bounce, and
paint the table in a victory cascade. There is no score, timer, account, or server.

## Run locally

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Dependencies include the supplied Simple 2D
engine; no additional setup, assets, credentials, or network services are needed.
All artwork is drawn in code and all ten sound cues are synthesized locally.

## Production build

```sh
npm ci
npm run build
```

The complete static site is written to `dist/`, with `dist/index.html` as its
entry point. Serve that directory with any static server, at a domain root or
under a sub-path. To preview it locally:

```sh
npm run preview
```

## Controls

- Click or tap the stock to turn three cards. Only the front card of the visible
  packet is playable. Click the empty stock to recycle the waste.
- Drag a face-up card, or a descending run of alternating colors, onto a column.
  Only a King can fill an empty column.
- Build each foundation upward by suit, from Ace to King. Double-click or
  double-tap an exposed tableau card or the front waste card to send it home.
- A foundation's top card may move back to a column. An invalid drop returns the
  held cards without changing the board.
- Use **NEW GAME**, **MENU**, and **SOUND** along the bottom of the table.
- Navigate menus with **↑ / W** and **↓ / S**. **Enter / Space** activates the
  selected item. **Escape** returns from the instructions.
- After a win, click or tap anywhere to deal again, even during the cascade.
- **Backquote** toggles the engine's read-only diagnostics overlay.

The stage fits the viewport with letterboxing, and pointer coordinates remain
consistent at different window sizes and pixel densities. A session starts fresh;
there is no saved game or persistent setting.

## Validation

```sh
npx tsc --noEmit
npx eslint .
npx prettier --check .
npx vitest run --coverage
```

Tests cover the deck, stock packet memory, legal and rejected moves, pointer and
keyboard input, menu navigation, diagnostics, sound events, cascade motion and
faculty gates. Engine integration tests render onto a real 2D canvas and exercise
recording. Coverage reports are written to `coverage/`.

`src/game.ts` exports the state types and game contract. `src/rules.ts` contains
the immutable, render-free transitions and the debug surface; `src/geometry.ts`
shares geometry between input and drawing; `src/drawing.ts` renders the screens
and maintains only drawing caches. The debug surface is available solely through
`engine.debug`: use `engine.apply(s => engine.debug.deal(s))` for a pose and
`engine.debug.snapshot(engine.state)` for a read. Nothing is exposed on the page.
The engine's API is documented in `engine/`.

## Showcase

`showcase/` contains the player description, carousel, screenshots, and a
four-second engine replay of legal pointer play. No board or outcome was posed
for these captures. To reproduce them, keep the development server running and
run:

```sh
node scripts/capture.mjs
```

The capture uses the project's Playwright Chromium with `--no-sandbox`. Set
`CASCADE_URL` if the development server is not at `http://localhost:5173`.
