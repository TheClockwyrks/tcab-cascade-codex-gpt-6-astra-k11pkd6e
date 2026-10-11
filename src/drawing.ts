import * as C from "./constants";
import type { CardState, State, Suit, TrailLayer } from "./game";
import { BACKGROUND } from "./game";
import {
  columnPositions,
  menuCount,
  menuItemRect,
  pileRect,
  top,
  visibleCount,
} from "./geometry";
import { color, target } from "./rules";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const INK = "#173f3b",
  IVORY = "#fff9e9",
  GOLD = "#d3b67b",
  RED = "#b54b42",
  SOFT = "#a5c3b7";
const symbols: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
const ranks: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  fill = IVORY,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
): void {
  ctx.fillStyle = fill;
  ctx.font =
    font === "600 sans-serif"
      ? `600 ${size}px sans-serif`
      : `${size}px ${font === "Georgia" ? "Georgia, Times New Roman, serif" : font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function box(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 8,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  stroke = GOLD,
): void {
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function diamond(ctx: Context, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size, y);
  ctx.closePath();
  ctx.stroke();
}

/** Every face and back uses the same card-sized footprint, including in flight. */
export function drawCard(
  ctx: Context,
  c: Pick<CardState, "suit" | "rank" | "faceUp">,
  x: number,
  y: number,
  lifted = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = lifted ? "#001e24aa" : "#001f2550";
  ctx.shadowBlur = lifted ? 20 : 4;
  ctx.shadowOffsetY = lifted ? 12 : 2;
  box(ctx, 0, 0, C.CARD_W, C.CARD_H, 7);
  ctx.fillStyle = IVORY;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#d8d5bf";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  if (!c.faceUp) {
    box(ctx, 5, 5, C.CARD_W - 10, C.CARD_H - 10, 4);
    ctx.fillStyle = "#245759";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "#669080";
    ctx.lineWidth = 0.65;
    for (let i = -C.CARD_H; i < C.CARD_W + C.CARD_H; i += 12) {
      line(ctx, i, 5, i + C.CARD_H, C.CARD_H - 5, "#4e8078");
      line(ctx, i, 5, i - C.CARD_H, C.CARD_H - 5, "#4e8078");
    }
    ctx.restore();
    box(ctx, 10, 10, C.CARD_W - 20, C.CARD_H - 20, 2);
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    ctx.fillStyle = "#245759";
    ctx.beginPath();
    ctx.ellipse(C.CARD_W / 2, C.CARD_H / 2, 25, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    diamond(ctx, C.CARD_W / 2, C.CARD_H / 2, 16);
    diamond(ctx, C.CARD_W / 2, C.CARD_H / 2, 9);
    text(ctx, "C", C.CARD_W / 2, C.CARD_H / 2, 18, GOLD, "Georgia", "center");
  } else {
    const shade = color(c) === "red" ? RED : INK;
    const rank = ranks[c.rank] ?? String(c.rank);
    text(ctx, rank, 9, 17, 22, shade, "Georgia");
    text(
      ctx,
      symbols[c.suit],
      c.rank === 10 ? 43 : 35,
      17,
      18,
      shade,
      "Georgia",
    );
    ctx.save();
    ctx.translate(C.CARD_W, C.CARD_H);
    ctx.rotate(Math.PI);
    text(ctx, rank, 9, 17, 22, shade, "Georgia");
    text(
      ctx,
      symbols[c.suit],
      c.rank === 10 ? 43 : 35,
      17,
      18,
      shade,
      "Georgia",
    );
    ctx.restore();
    if (c.rank >= 11) {
      ctx.strokeStyle = "#d8c8a3";
      ctx.lineWidth = 1;
      box(ctx, 20, 36, 60, 68, 2);
      ctx.stroke();
      diamond(ctx, 50, 70, 27);
      text(ctx, symbols[c.suit], 50, 70, 41, shade, "Georgia", "center");
    } else if (c.rank === C.RANK_MIN) {
      text(ctx, symbols[c.suit], 50, 70, 52, shade, "Georgia", "center");
      text(ctx, "C A S C A D E", 50, 110, 7, "#8c8f77", "sans-serif", "center");
    } else {
      // Small, balanced pip rows leave both corner indexes unobstructed.
      const rows = Math.ceil(c.rank / 2);
      for (let i = 0; i < c.rank; i++) {
        const row = Math.floor(i / 2),
          lone = i === c.rank - 1 && c.rank % 2 === 1;
        text(
          ctx,
          symbols[c.suit],
          lone ? 50 : i % 2 ? 67 : 33,
          41 + row * (58 / Math.max(1, rows - 1)),
          20,
          shade,
          "Georgia",
          "center",
        );
      }
    }
  }
  ctx.restore();
}
function slot(
  ctx: Context,
  x: number,
  y: number,
  label: string,
  highlight = false,
  h = C.CARD_H,
): void {
  ctx.save();
  box(ctx, x, y, C.CARD_W, h, 8);
  ctx.fillStyle = highlight ? "#d3b67b24" : "#002c2a30";
  ctx.fill();
  ctx.strokeStyle = highlight ? "#f2d89f" : "#779f8865";
  ctx.lineWidth = highlight ? 3 : 1;
  ctx.setLineDash(highlight ? [] : [3, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  text(
    ctx,
    label,
    x + C.CARD_W / 2,
    y + C.CARD_H / 2,
    label === "↻" ? 36 : 23,
    highlight ? IVORY : "#7da08c",
    "Georgia",
    "center",
  );
  ctx.restore();
}
function felt(ctx: Context): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  const gradient = ctx.createRadialGradient(660, 260, 80, 640, 360, 800);
  gradient.addColorStop(0, "#226055");
  gradient.addColorStop(1, "#0b302f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  // A restrained woven grain, drawn entirely as geometry.
  ctx.fillStyle = "#e7e6b805";
  for (let y = 3; y < C.STAGE_H; y += 11)
    for (let x = (y % 2) * 3; x < C.STAGE_W; x += 13) ctx.fillRect(x, y, 1, 1);
  ctx.lineWidth = 1;
  box(ctx, 18, 14, C.STAGE_W - 36, C.STAGE_H - 28, 18);
  ctx.strokeStyle = "#bda46b35";
  ctx.stroke();
}
function menus(ctx: Context, s: State): void {
  const labels =
    s.screen === "title"
      ? C.TITLE_ITEMS
      : s.screen === "howto"
        ? [C.HOWTO_BACK_LABEL]
        : C.HUD_ITEMS;
  for (let i = 0; i < menuCount(s); i++) {
    const r = menuItemRect(s, i)!;
    const selected = i === s.menuIndex,
      hud = s.screen === "playing";
    ctx.save();
    box(ctx, r.x, r.y + (hud ? 3 : 0), r.w, r.h - (hud ? 6 : 0), hud ? 4 : 6);
    ctx.fillStyle = selected ? (hud ? "#d2b77b25" : GOLD) : "#092f2e55";
    ctx.fill();
    ctx.strokeStyle = selected ? GOLD : "#769b8055";
    ctx.lineWidth = 1;
    ctx.stroke();
    text(
      ctx,
      labels[i],
      r.x + (hud ? 14 : 23),
      r.y + r.h / 2,
      hud ? 11 : 13,
      selected && !hud ? INK : IVORY,
      "600 sans-serif",
    );
    if (hud && i === 2) {
      ctx.fillStyle = s.muted ? "#628276" : GOLD;
      ctx.beginPath();
      ctx.arc(r.x + r.w - 19, r.y + r.h / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      if (s.muted)
        line(
          ctx,
          r.x + r.w - 23,
          r.y + r.h / 2 + 5,
          r.x + r.w - 15,
          r.y + r.h / 2 - 5,
          IVORY,
        );
    } else if (!hud)
      text(
        ctx,
        "→",
        r.x + r.w - 26,
        r.y + r.h / 2,
        20,
        selected ? INK : GOLD,
        "sans-serif",
        "center",
      );
    ctx.restore();
  }
}
function title(ctx: Context, s: State): void {
  text(ctx, "THE QUIET PLEASURE OF PATIENCE", 112, 142, 11, GOLD, "sans-serif");
  text(ctx, C.TITLE_TEXT, 106, 222, 83, IVORY, "Georgia");
  text(ctx, C.TAGLINE_TEXT, 112, 288, 15, SOFT, "sans-serif");
  line(ctx, 112, 329, 164, 329, GOLD);
  text(
    ctx,
    "A little order. A beautiful ending.",
    112,
    360,
    20,
    IVORY,
    "Georgia",
  );
  menus(ctx, s);
  text(ctx, C.DEAL_MODE_LABEL, 112, 566, 11, GOLD, "sans-serif");
  text(
    ctx,
    "Three cards at a time. All the time in the world.",
    112,
    594,
    13,
    SOFT,
  );
  ctx.save();
  ctx.translate(880, 380);
  const fan = [
    { suit: "clubs", rank: 13 },
    { suit: "diamonds", rank: 12 },
    { suit: "spades", rank: 11 },
    { suit: "hearts", rank: 1 },
  ] as const;
  fan.forEach((c, i) => {
    ctx.save();
    ctx.rotate(((-24 + i * 16) * Math.PI) / 180);
    ctx.translate(-108 + i * 40, -112 + i * 9);
    ctx.scale(1.65, 1.65);
    drawCard(ctx, { ...c, faceUp: true }, 0, 0, true);
    ctx.restore();
  });
  ctx.restore();
  text(ctx, "♠   ♥   ♦   ♣", 916, 624, 19, GOLD, "Georgia", "center");
  text(
    ctx,
    "MAKE ROOM FOR A MOMENT OF PLAY",
    916,
    654,
    9,
    SOFT,
    "sans-serif",
    "center",
  );
}
function howto(ctx: Context, s: State): void {
  text(ctx, "A TABLE FOR ONE", 112, 95, 11, GOLD);
  text(ctx, "The art of letting go.", 109, 149, 49, IVORY, "Georgia");
  const sections = [
    [
      "01",
      "Build your foundations",
      "Take each suit from ACE to KING in the four top slots.",
    ],
    [
      "02",
      "Make room below",
      "Build columns down, alternating red and black.",
      "Move a whole face-up run. Only a KING fills an empty column.",
    ],
    [
      "03",
      "Turn a fresh possibility",
      "Click the STOCK to turn three cards. Play the front card.",
      "When the stock runs out, click it again to recycle the waste.",
    ],
    [
      "04",
      "Pick up. Place. Repeat.",
      "Drag cards onto a column or foundation to move them.",
      "DOUBLE-CLICK a top card to send it to its foundation.",
    ],
  ];
  sections.forEach(([n, heading, ...lines], i) => {
    const y = 232 + i * 86;
    text(ctx, n, 112, y, 14, GOLD, "Georgia");
    text(ctx, heading, 154, y, 23, IVORY, "Georgia");
    lines.forEach((v, j) => text(ctx, v, 154, y + 29 + j * 21, 14, SOFT));
  });
  menus(ctx, s);
  ctx.save();
  ctx.translate(974, 250);
  ctx.rotate(0.1);
  drawCard(ctx, { suit: "clubs", rank: 13, faceUp: true }, 0, 0);
  drawCard(ctx, { suit: "hearts", rank: 12, faceUp: true }, 0, 45);
  drawCard(ctx, { suit: "spades", rank: 11, faceUp: true }, 0, 90);
  ctx.restore();
  text(ctx, "Find your rhythm.", 1018, 527, 20, GOLD, "Georgia", "center");
  text(
    ctx,
    "The cards will follow.",
    1018,
    555,
    14,
    SOFT,
    "sans-serif",
    "center",
  );
}
function table(ctx: Context, s: State): void {
  text(ctx, C.TITLE_TEXT, 48, 57, 21, GOLD, "Georgia");
  text(ctx, "P A T I E N C E", 49, 82, 8, SOFT);
  line(ctx, 49, 109, 151, 109, "#7c9a7360");
  text(ctx, "♠", 1118, 69, 21, GOLD, "Georgia");
  text(ctx, "♥", 1160, 69, 21, GOLD, "Georgia");
  text(ctx, "♦", 1118, 108, 21, GOLD, "Georgia");
  text(ctx, "♣", 1160, 108, 21, GOLD, "Georgia");
  slot(ctx, C.STOCK_X, C.TOP_ROW_Y, "↻");
  const stock = top(s.stock);
  if (stock) drawCard(ctx, stock, C.STOCK_X, C.TOP_ROW_Y);
  slot(ctx, C.WASTE_X, C.TOP_ROW_Y, "");
  const held = s.drag?.fromPile === "waste" ? s.drag.cards.length : 0;
  const visible = Math.min(C.TURN_COUNT, visibleCount(s));
  const first = s.waste.length + held - visible;
  if (visible > 0)
    s.waste.forEach((c, i) => {
      if (i >= Math.max(0, first - 1))
        drawCard(
          ctx,
          c,
          C.WASTE_X + Math.max(0, i - first) * C.WASTE_FAN,
          C.TOP_ROW_Y,
        );
    });
  for (let i = 0; i < C.FOUNDATION_COUNT; i++) {
    slot(ctx, C.FOUNDATION_X[i], C.TOP_ROW_Y, "A");
    const card = top(s.foundations[i]);
    if (card) drawCard(ctx, card, C.FOUNDATION_X[i], C.TOP_ROW_Y);
  }
  for (let i = 0; i < C.TABLEAU_COLUMNS; i++) {
    slot(ctx, C.COLUMN_X[i], C.TABLEAU_Y, "K");
    const ys = columnPositions(s.tableau[i]);
    s.tableau[i].forEach((c, j) => drawCard(ctx, c, C.COLUMN_X[i], ys[j]));
  }
  const t = target(s);
  if (t) {
    const r = pileRect(s, t.pile, t.index);
    slot(ctx, r.x, r.y, "", true, r.h);
  }
  ctx.fillStyle = "#092e2df2";
  ctx.fillRect(0, C.HUD_Y, C.STAGE_W, C.HUD_H);
  line(
    ctx,
    C.STOCK_X,
    C.HUD_Y,
    C.COLUMN_X[C.TABLEAU_COLUMNS - 1] + C.CARD_W,
    C.HUD_Y,
    "#b8ad7040",
  );
  menus(ctx, s);
  text(
    ctx,
    C.DEAL_MODE_LABEL,
    C.COLUMN_X[C.TABLEAU_COLUMNS - 1] + C.CARD_W,
    C.HUD_Y + C.HUD_H / 2,
    11,
    GOLD,
    "sans-serif",
    "right",
  );
  if (s.drag)
    s.drag.cards.forEach((c, i) =>
      drawCard(ctx, c, s.drag!.x, s.drag!.y + i * C.FACE_UP_OFFSET, true),
    );
}

// The simulation stores immutable stamp commands. Only this drawing cache owns
// a mutable surface; it never feeds values back into the game or counts stamps.
interface PaintCache {
  surface: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  last: TrailLayer | null;
}
const painted = new WeakMap<Context, PaintCache>();
function trail(ctx: Context, layer: TrailLayer | null): void {
  if (!layer) {
    painted.delete(ctx);
    return;
  }
  let cache = painted.get(ctx);
  if (!cache && typeof OffscreenCanvas !== "undefined") {
    const surface = new OffscreenCanvas(C.STAGE_W, C.STAGE_H),
      ink = surface.getContext("2d");
    if (ink) {
      cache = { surface, ctx: ink, last: null };
      painted.set(ctx, cache);
    }
  }
  const pending: TrailLayer[] = [];
  let node: TrailLayer | null = layer;
  while (node && node !== cache?.last) {
    pending.push(node);
    node = node.parent;
  }
  if (cache && !node && cache.last)
    cache.ctx.clearRect(0, 0, C.STAGE_W, C.STAGE_H);
  const destination = cache?.ctx ?? ctx;
  pending
    .reverse()
    .forEach((frame) =>
      frame.stamps.forEach((f) =>
        drawCard(destination, { ...f, faceUp: true }, f.x, f.y),
      ),
    );
  if (cache) {
    cache.last = layer;
    ctx.drawImage(cache.surface, 0, 0);
  }
}
export function render(s: State, ctx: CanvasRenderingContext2D): void {
  ctx.save();
  felt(ctx);
  if (s.screen === "title") title(ctx, s);
  else if (s.screen === "howto") howto(ctx, s);
  else if (s.screen === "playing") table(ctx, s);
  else {
    trail(ctx, s.trail);
    s.foundations.forEach((p, i) => {
      const c = top(p);
      if (c) drawCard(ctx, c, C.FOUNDATION_X[i], C.TOP_ROW_Y);
    });
    s.flyers.forEach((f) => drawCard(ctx, { ...f, faceUp: true }, f.x, f.y));
    if (s.cascadeDone) {
      ctx.fillStyle = "#0c3634e8";
      box(ctx, 392, 242, 496, 202, 14);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      text(ctx, C.WIN_TEXT, C.STAGE_W / 2, 313, 60, IVORY, "Georgia", "center");
      text(
        ctx,
        "A little order. A glorious cascade.",
        C.STAGE_W / 2,
        370,
        18,
        GOLD,
        "Georgia",
        "center",
      );
      text(
        ctx,
        "CLICK ANYWHERE TO PLAY AGAIN",
        C.STAGE_W / 2,
        411,
        11,
        SOFT,
        "sans-serif",
        "center",
      );
    }
  }
  ctx.restore();
}
