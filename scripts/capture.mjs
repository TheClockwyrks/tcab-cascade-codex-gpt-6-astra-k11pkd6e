/* global document */
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import process from "node:process";

// Run against npm run dev. This harness holds its engine as a Playwright handle;
// the production page exports no globals or testing hooks.
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.route("**/src/main.ts*", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.goto(process.env.CASCADE_URL ?? "http://localhost:5173");
  const handle = await page.evaluateHandle(async () => {
    const { createEngine, ConstantClock } =
      await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
    const { game, BACKGROUND } = await import("/src/game.ts");
    const { STAGE_W, STAGE_H } = await import("/src/constants.ts");
    const engine = createEngine({
      canvas: document.querySelector("canvas"),
      width: STAGE_W,
      height: STAGE_H,
      game,
      background: BACKGROUND,
      clock: new ConstantClock(1000 / 30),
    });
    await engine.initialize();
    await engine.advance(1);
    return engine;
  });
  await mkdir("showcase", { recursive: true });
  await page.screenshot({ path: "showcase/title.png" });
  const setup = await handle.evaluate(async (e) => {
    const C = await import("/src/constants.ts");
    const { columnPositions } = await import("/src/geometry.ts");
    const d = e.debug;
    // A normal menu click starts each fresh random deal. Nothing is posed.
    const click = (x, y) => {
      e.apply((s) => d.pointerDown(s, x, y));
      e.apply((s) => d.pointerUp(s, x, y));
    };
    const start = d.menuItemRect(e.state, 0);
    click(start.x + 20, start.y + 20);
    await e.advance(12);
    // Preview ordinary legal moves without applying their returned state. This
    // is only a capture director: all recorded moves use the pointer path.
    function candidate() {
      const s = e.state;
      const options = [];
      s.tableau.forEach((p, from) =>
        p.forEach((c, row) => {
          if (!c.faceUp) return;
          for (let to = 0; to < C.TABLEAU_COLUMNS; to++) {
            if (!s.tableau[to].length) continue;
            if (d.move(s, "tableau", from, row, "tableau", to)[1]) {
              options.push({
                from,
                row,
                to,
                count: p.length - row,
                x: C.COLUMN_X[from],
                y: columnPositions(p)[row],
              });
            }
          }
        }),
      );
      return options.sort((a, b) => b.count - a.count)[0];
    }
    let chosen;
    for (let attempt = 0; attempt < 40 && !chosen; attempt++) {
      click(C.STOCK_X + 20, C.TOP_ROW_Y + 20);
      await e.advance(12);
      chosen = candidate();
      if (!chosen) {
        const fresh = d.menuItemRect(e.state, 0);
        click(fresh.x + 20, fresh.y + 15);
        await e.advance(12);
      }
    }
    if (!chosen) throw new Error("No suitable legal move found for capture");
    return chosen;
  });
  await page.screenshot({ path: "showcase/table.png" });
  await handle.evaluate(async (e, chosen) => {
    const C = await import("/src/constants.ts");
    const { columnPositions } = await import("/src/geometry.ts");
    const d = e.debug;
    e.startRecording();
    await e.advance(20);
    e.apply((s) => d.pointerDown(s, chosen.x + 18, chosen.y + 12));
    const destination = {
      x: C.COLUMN_X[chosen.to],
      y: columnPositions(e.state.tableau[chosen.to]).at(-1),
    };
    for (let frame = 1; frame <= 32; frame++) {
      const t = frame / 32,
        ease = t * t * (3 - 2 * t);
      const x = chosen.x + (destination.x - chosen.x) * ease + 18;
      const y =
        chosen.y +
        (destination.y - chosen.y) * ease -
        Math.sin(t * Math.PI) * 40 +
        12;
      e.apply((s) => d.pointerMove(s, x, y));
      await e.advance(1);
    }
    await e.advance(12);
    e.apply((s) => d.pointerUp(s, destination.x + 18, destination.y + 12));
    if (e.state.drag || e.state.tableau[chosen.to].length <= chosen.count)
      throw new Error("Capture move failed");
    await e.advance(24);
    e.apply((s) => d.pointerDown(s, C.STOCK_X + 20, C.TOP_ROW_Y + 20));
    e.apply((s) => d.pointerUp(s, C.STOCK_X + 20, C.TOP_ROW_Y + 20));
    await e.advance(32);
  }, setup);
  const recording = await handle.evaluate((e) => e.stopRecording());
  if (recording.frames.some((f) => f.truncated))
    throw new Error("Truncated replay");
  const compressed = gzipSync(JSON.stringify(recording));
  if (compressed.length >= 25 * 1024 * 1024)
    throw new Error("Replay exceeds showcase limit");
  await writeFile("showcase/live-play.json.gz", compressed);
  process.stdout.write(
    `Captured ${recording.frames.length} frames of legal play (${compressed.length} bytes compressed).\n`,
  );
  await handle.evaluate((e) => e.destroy());
} finally {
  await browser.close();
}
