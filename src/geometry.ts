import * as C from "./constants";
import type { CardState, PileKind, State } from "./game";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const top = <T>(a: readonly T[]): T | undefined => a[a.length - 1];
export const visibleCount = (s: State): number => top(s.wasteSets) ?? 0;

/** Compression depends on the cards above the last card, not on its face. */
export function columnPositions(cards: readonly CardState[]): number[] {
  const above = cards.slice(0, -1);
  const down = above.filter((c) => !c.faceUp).length;
  const up = above.length - down;
  const pitch =
    up === 0
      ? C.FACE_UP_OFFSET
      : Math.max(
          C.FACE_UP_OFFSET_MIN,
          Math.min(
            C.FACE_UP_OFFSET,
            (C.COLUMN_BOTTOM_LIMIT -
              C.TABLEAU_Y -
              C.CARD_H -
              down * C.FACE_DOWN_OFFSET) /
              up,
          ),
        );
  let y = C.TABLEAU_Y;
  return cards.map((c) => {
    const result = y;
    y += c.faceUp ? pitch : C.FACE_DOWN_OFFSET;
    return result;
  });
}
export function pileRect(s: State, pile: PileKind, index: number): Rect {
  let x: number,
    y = C.TOP_ROW_Y,
    h = C.CARD_H;
  switch (pile) {
    case "stock":
      x = C.STOCK_X;
      break;
    case "waste":
      x = C.WASTE_X;
      break;
    case "foundation":
      x = C.FOUNDATION_X[index];
      break;
    case "tableau":
      x = C.COLUMN_X[index];
      y = C.TABLEAU_Y;
      h = (top(columnPositions(s.tableau[index])) ?? y) + C.CARD_H - y;
      break;
  }
  return { x, y, w: C.CARD_W, h };
}
export function menuCount(s: State): number {
  return s.screen === "title"
    ? C.TITLE_ITEMS.length
    : s.screen === "howto"
      ? 1
      : s.screen === "playing"
        ? C.HUD_ITEMS.length
        : 0;
}
export function menuItemRect(s: State, index: number): Rect | null {
  if (!Number.isInteger(index) || index < 0 || index >= menuCount(s))
    return null;
  if (s.screen === "playing")
    return { x: C.STOCK_X + index * 142, y: C.HUD_Y, w: 130, h: C.HUD_H };
  if (s.screen === "howto") return { x: 112, y: 596, w: 220, h: 50 };
  return { x: 112, y: 398 + index * 68, w: 286, h: 52 };
}

export interface Hit {
  pile: "waste" | "foundation" | "tableau";
  index: number;
  row: number;
  x: number;
  y: number;
}
export function hitCard(s: State, x: number, y: number): Hit | null {
  for (let i = C.TABLEAU_COLUMNS - 1; i >= 0; i--) {
    const p = s.tableau[i],
      ys = columnPositions(p);
    for (let row = p.length - 1; row >= 0; row--)
      if (
        contains(
          { x: C.COLUMN_X[i], y: ys[row], w: C.CARD_W, h: C.CARD_H },
          x,
          y,
        )
      )
        return { pile: "tableau", index: i, row, x: C.COLUMN_X[i], y: ys[row] };
  }
  for (let i = 0; i < C.FOUNDATION_COUNT; i++)
    if (s.foundations[i].length && contains(pileRect(s, "foundation", i), x, y))
      return {
        pile: "foundation",
        index: i,
        row: s.foundations[i].length - 1,
        x: C.FOUNDATION_X[i],
        y: C.TOP_ROW_Y,
      };
  const n = Math.min(C.TURN_COUNT, visibleCount(s));
  if (n > 0 && s.waste.length) {
    const wx = C.WASTE_X + (n - 1) * C.WASTE_FAN;
    if (contains({ x: wx, y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H }, x, y))
      return {
        pile: "waste",
        index: 0,
        row: s.waste.length - 1,
        x: wx,
        y: C.TOP_ROW_Y,
      };
  }
  return null;
}
