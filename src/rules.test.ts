import { describe, expect, it, vi } from "vitest";
import * as C from "./constants";
import {
  advance,
  color,
  createDebug,
  deal,
  drawLaunchVx,
  initialState,
  move,
  pointerEvent,
  snapshot,
  turnStock,
} from "./rules";
import { columnPositions, hitCard, menuItemRect, pileRect } from "./geometry";
import type { CascadeState, PileKind, Suit } from "./game";

const d = createDebug();
const card = (
  s: CascadeState,
  kind: PileKind,
  index: number,
  rank: number,
  suit: Suit = "spades",
  up = true,
) => d.addCard(s, kind, index, suit, rank, up);
const playing = () => d.setScreen(initialState(), "playing");
function complete(): CascadeState {
  let s = playing();
  C.SUITS.forEach((suit, i) => {
    for (let rank = C.RANK_MIN; rank <= C.RANK_MAX; rank++)
      s = card(s, "foundation", i, rank, suit);
  });
  return s;
}

describe("deal and draw-three stock", () => {
  it("deals a full unique deck, preserving the input and screen", () => {
    const s = initialState();
    const next = deal(s);
    expect(s).toEqual(initialState());
    expect(next.screen).toBe("title");
    expect(next.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(next.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(next.tableau.flat().filter((c) => c.faceUp)).toHaveLength(
      C.TABLEAU_COLUMNS,
    );
    const deck = [...next.stock, ...next.tableau.flat()];
    expect(new Set(deck.map((c) => c.id)).size).toBe(C.DECK_SIZE);
    expect(new Set(deck.map((c) => `${c.suit}-${c.rank}`)).size).toBe(
      C.DECK_SIZE,
    );
    next.tableau.forEach((p) => {
      expect(p.slice(0, -1).every((c) => !c.faceUp)).toBe(true);
      expect(p[p.length - 1].faceUp).toBe(true);
    });
  });
  it("turns top first, remembers packets and recycles in original order", () => {
    let s = initialState();
    for (let rank = 1; rank <= 5; rank++)
      s = card(s, "stock", 0, rank, "clubs", false);
    const original = s.stock.map((c) => c.id);
    s = turnStock(s);
    expect(s.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
    expect(s.wasteSets).toEqual([3]);
    s = turnStock(s);
    expect(s.waste.map((c) => c.rank)).toEqual([5, 4, 3, 2, 1]);
    expect(s.wasteSets).toEqual([3, 2]);
    expect(s.waste.every((c) => c.faceUp)).toBe(true);
    s = turnStock(s);
    expect(s.stock.map((c) => c.id)).toEqual(original);
    expect(s.stock.every((c) => !c.faceUp)).toBe(true);
    expect(s.wasteSets).toEqual([]);
    s = turnStock(s);
    expect(s.waste.map((c) => c.rank)).toEqual([5, 4, 3]);
  });
  it("empty stock and waste are inert", () =>
    expect(turnStock(initialState())).toEqual(initialState()));
  it("preserves packet memory while lifted and on rejected or clicked returns", () => {
    let s = card(playing(), "waste", 0, 13, "hearts");
    s = d.addWasteSet(s, 1);
    const before = s.waste;
    s = d.pointerDown(s, C.WASTE_X + 10, C.TOP_ROW_Y + 10);
    expect(s.drag?.cards).toEqual(before);
    expect(s.wasteSets).toEqual([1]);
    expect(s.waste).toEqual([]);
    s = d.pointerUp(s, C.WASTE_X + 10, C.TOP_ROW_Y + 10);
    expect(s.waste).toEqual(before);
    expect(s.wasteSets).toEqual([1]);
    s = advance(s, 1);
    s = d.pointerDown(s, C.WASTE_X + 10, C.TOP_ROW_Y + 10);
    s = d.pointerUp(s, 30, 500);
    expect(s.waste).toEqual(before);
    expect(s.wasteSets).toEqual([1]);
  });
  it("removes an exhausted packet and falls back to the previous packet", () => {
    let s = card(playing(), "waste", 0, 7, "clubs");
    s = d.addWasteSet(s, 1);
    s = card(s, "waste", 0, 1, "hearts");
    s = d.addWasteSet(s, 1);
    const result = d.autoMove(s, "waste", 0);
    expect(result[1]).toBe(true);
    s = result[0];
    expect(s.wasteSets).toEqual([1]);
    expect(snapshot(s).wasteVisibleCount).toBe(1);
    s = d.removeCard(s, s.waste[0].id);
    expect(s.wasteSets).toEqual([]);
  });
  it("refuses hidden waste and covered fan cards", () => {
    let s = card(playing(), "waste", 0, 1);
    expect(d.autoMove(s, "waste", 0)[1]).toBe(false);
    s = d.addWasteSet(s, 1);
    s = card(s, "waste", 0, 2);
    s = card(s, "waste", 0, 3);
    s = d.clearWasteSets(s);
    s = d.addWasteSet(s, 3);
    expect(move(s, "waste", 0, 0, "foundation", 0)[1]).toBe(false);
    expect(hitCard(s, C.WASTE_X + 5, C.TOP_ROW_Y + 30)).toBeNull();
    expect(
      hitCard(s, C.WASTE_X + 2 * C.WASTE_FAN + 5, C.TOP_ROW_Y + 30)?.row,
    ).toBe(2);
  });
});

describe("foundations and tableau", () => {
  it("accepts any ace on any empty foundation then only its next suit rank", () => {
    let s = card(playing(), "tableau", 0, 1, "hearts");
    const [next, ok] = move(s, "tableau", 0, 0, "foundation", 3);
    s = next;
    expect(ok).toBe(true);
    s = card(s, "tableau", 0, 2, "spades");
    expect(move(s, "tableau", 0, 0, "foundation", 3)[1]).toBe(false);
    s = d.clearPile(s, "tableau", 0);
    s = card(s, "tableau", 0, 3, "hearts");
    expect(move(s, "tableau", 0, 0, "foundation", 3)[1]).toBe(false);
    s = d.clearPile(s, "tableau", 0);
    s = card(s, "tableau", 0, 2, "hearts");
    expect(move(s, "tableau", 0, 0, "foundation", 3)[1]).toBe(true);
  });
  it("moves an alternating run in order and flips only the exposed card", () => {
    let s = card(playing(), "tableau", 0, 4, "clubs", false);
    s = card(s, "tableau", 0, 6, "spades", false);
    s = card(s, "tableau", 0, 12, "hearts");
    s = card(s, "tableau", 0, 11, "clubs");
    s = card(s, "tableau", 1, 13);
    const original = s;
    const [n, ok] = move(s, "tableau", 0, 2, "tableau", 1);
    expect(ok).toBe(true);
    expect(n.tableau[1].map((c) => c.rank)).toEqual([13, 12, 11]);
    expect(n.tableau[0].map((c) => c.faceUp)).toEqual([false, true]);
    expect(original.tableau[0][1].faceUp).toBe(false);
  });
  it("refuses malformed runs, covered sources, same piles and stock/waste targets", () => {
    let s = card(playing(), "tableau", 0, 13);
    s = card(s, "tableau", 0, 12, "clubs");
    expect(move(s, "tableau", 0, 0, "tableau", 1)).toEqual([s, false]);
    s = d.clearPile(s, "tableau", 0);
    s = card(s, "tableau", 0, 13, "hearts", false);
    expect(move(s, "tableau", 0, 0, "tableau", 1)).toEqual([s, false]);
    s = d.setCardFaceUp(s, s.tableau[0][0].id, true);
    for (const target of ["stock", "waste", "tableau"] as const)
      expect(move(s, "tableau", 0, 0, target, 0)).toEqual([s, false]);
  });
  it("only kings fill an empty column; foundations can return to columns", () => {
    let s = card(playing(), "foundation", 0, 12, "hearts");
    s = card(s, "tableau", 0, 13);
    expect(move(s, "foundation", 0, 0, "tableau", 1)[1]).toBe(false);
    expect(move(s, "foundation", 0, 0, "tableau", 0)[1]).toBe(true);
    expect(d.autoMove(s, "foundation", 0)[1]).toBe(false);
    expect(move(s, "foundation", 0, 0, "foundation", 1)[1]).toBe(false);
  });
  it("does not turn under a lift or a refusal, and respects the auto-flip gate", () => {
    let s = card(playing(), "tableau", 0, 4, "clubs", false);
    s = card(s, "tableau", 0, 13, "hearts");
    s = d.pointerDown(
      s,
      C.COLUMN_X[0] + 10,
      C.TABLEAU_Y + C.FACE_DOWN_OFFSET + 10,
    );
    expect(s.tableau[0][0].faceUp).toBe(false);
    s = d.pointerUp(s, 100, 500);
    expect(s.tableau[0][0].faceUp).toBe(false);
    s = d.setAutoFlip(s, false);
    const [n, ok] = move(s, "tableau", 0, 1, "tableau", 1);
    expect(ok).toBe(true);
    expect(n.tableau[0][0].faceUp).toBe(false);
  });
  it("refuses a multi-card foundation move", () => {
    let s = card(playing(), "tableau", 0, 2, "hearts");
    s = card(s, "tableau", 0, 1, "clubs");
    s = card(s, "foundation", 0, 1, "hearts");
    expect(move(s, "tableau", 0, 0, "foundation", 0)[1]).toBe(false);
  });
});

describe("pointer, menus and geometry", () => {
  it("moves by pointer delta, highlights by card center and commits the drop", () => {
    let s = card(playing(), "tableau", 0, 13, "hearts");
    s = card(s, "tableau", 0, 12, "clubs");
    s = d.pointerDown(s, C.COLUMN_X[0] + 10, C.TABLEAU_Y + 10);
    expect(s.drag?.x).toBe(C.COLUMN_X[0]);
    expect(s.drag?.cards).toHaveLength(2);
    expect(s.tableau[0]).toEqual([]);
    s = d.pointerMove(s, C.COLUMN_X[1] + 10, C.TABLEAU_Y + 10);
    expect(s.drag?.x).toBe(C.COLUMN_X[1]);
    expect(snapshot(s).dropTarget).toEqual({ pile: "tableau", index: 1 });
    s = d.pointerUp(s, C.COLUMN_X[1] + 10, C.TABLEAU_Y + 10);
    expect(s.drag).toBeNull();
    expect(s.tableau[1].map((c) => c.rank)).toEqual([13, 12]);
  });
  it("clicks return cards and only stock clicks turn stock", () => {
    let s = deal(playing());
    s = d.pointerDown(s, C.STOCK_X + 10, C.TOP_ROW_Y + 10);
    s = d.pointerUp(s, C.STOCK_X + 10, C.TOP_ROW_Y + 10);
    expect(s.waste).toHaveLength(C.TURN_COUNT);
    s = d.pointerDown(s, C.STOCK_X + 10, C.TOP_ROW_Y + 10);
    s = d.pointerUp(s, C.STOCK_X + 30, C.TOP_ROW_Y + 10);
    expect(s.waste).toHaveLength(C.TURN_COUNT);
  });
  it("double-clicks use simulation time, auto-home only playable top cards, and consume release", () => {
    let s = card(playing(), "tableau", 0, 1, "hearts");
    s = d.pointerDown(s, 230, 190);
    s = d.pointerUp(s, 230, 190);
    s = advance(s, 0.2);
    s = d.pointerDown(s, 232, 193);
    expect(s.drag).toBeNull();
    expect(s.foundations[0][0].rank).toBe(1);
    expect(s.lastPress).toEqual({ x: 232, y: 193, at: 0.2 });
    const n = d.pointerUp(s, 232, 193);
    expect(n.tableau).toEqual(s.tableau);
  });
  it("distant or late presses are normal lifts; rejected double clicks lift nothing", () => {
    let s = card(playing(), "tableau", 0, 9, "clubs");
    s = d.pointerDown(s, 230, 190);
    s = d.pointerUp(s, 230, 190);
    s = d.pointerDown(s, 230, 190);
    expect(s.drag).toBeNull();
    s = d.pointerUp(s, 230, 190);
    s = advance(s, C.DOUBLE_CLICK_WINDOW + 0.01);
    s = d.pointerDown(s, 230, 190);
    expect(s.drag).not.toBeNull();
  });
  it("selects on hover, requires both edges in one control and remembers title selection", () => {
    let s = initialState();
    const r = menuItemRect(s, 1)!;
    s = d.pointerMove(s, r.x + 5, r.y + 5);
    expect(s.menuIndex).toBe(1);
    s = d.pointerDown(s, r.x + 5, r.y + 5);
    s = d.pointerUp(s, 900, 600);
    expect(s.screen).toBe("title");
    s = d.pointerDown(s, r.x + 5, r.y + 5);
    s = d.pointerUp(s, r.x + 5, r.y + 5);
    expect(s.screen).toBe("howto");
    expect(s.titleIndex).toBe(1);
    expect(s.menuIndex).toBe(0);
    const back = menuItemRect(s, 0)!;
    s = d.pointerDown(s, back.x + 5, back.y + 5);
    s = d.pointerUp(s, back.x + 5, back.y + 5);
    expect(s.screen).toBe("title");
    expect(s.menuIndex).toBe(1);
    expect(menuItemRect(s, 2)).toBeNull();
    expect(menuItemRect(d.setScreen(s, "won"), 0)).toBeNull();
  });
  it("compresses only face-up offsets and restores them when a column shrinks", () => {
    let s = playing();
    for (let i = 0; i < 6; i++) s = card(s, "tableau", 0, 1, "clubs", false);
    for (let i = 0; i < 10; i++) s = card(s, "tableau", 0, 1);
    const ys = columnPositions(s.tableau[0]);
    expect(ys[1] - ys[0]).toBe(C.FACE_DOWN_OFFSET);
    expect(ys[ys.length - 1] + C.CARD_H).toBeCloseTo(C.COLUMN_BOTTOM_LIMIT);
    expect(columnPositions(s.tableau[0].slice(6, 9))).toEqual([
      C.TABLEAU_Y,
      C.TABLEAU_Y + C.FACE_UP_OFFSET,
      C.TABLEAU_Y + 2 * C.FACE_UP_OFFSET,
    ]);
    expect(pileRect(s, "waste", 0).w).toBe(C.CARD_W);
    for (let i = 0; i < 30; i++) s = card(s, "tableau", 0, 1);
    const long = columnPositions(s.tableau[0]);
    expect(long[8] - long[7]).toBe(C.FACE_UP_OFFSET_MIN);
  });
});

describe("win and render-free cascade", () => {
  it("detects the final accepted home immediately", () => {
    let s = complete();
    const king = s.foundations[3][12];
    s = d.removeCard(s, king.id);
    s = card(s, "tableau", 2, 13, "clubs");
    const [n, ok] = d.autoMove(s, "tableau", 2);
    expect(ok).toBe(true);
    expect(n.screen).toBe("won");
    expect(n.launchClock).toBe(C.LAUNCH_INTERVAL);
    expect(n.tableau.flat()).toHaveLength(0);
  });
  it("gates detection without disturbing completed foundations", () => {
    const s = d.setWinDetect(complete(), false);
    expect(advance(s, 1).screen).toBe("playing");
    expect(advance(d.setWinDetect(s, true), 0).screen).toBe("won");
  });
  it("launches kings in cyclic order, without moving new flyers", () => {
    let s = advance(complete(), 0);
    expect(s.launched).toBe(1);
    expect(s.flyers[0]).toMatchObject({
      rank: 13,
      suit: "spades",
      x: C.FOUNDATION_X[0],
      y: C.TOP_ROW_Y,
      vy: C.LAUNCH_VY,
    });
    s = advance(s, C.LAUNCH_INTERVAL * 3 + 1e-10);
    expect(s.launched).toBe(4);
    expect(s.flyers.map((f) => f.suit)).toEqual(C.SUITS);
    expect(s.flyers[3].y).toBe(C.TOP_ROW_Y);
    expect(s.foundations.map((p) => p.length)).toEqual([12, 12, 12, 12]);
  });
  it("integrates gravity, then position, bounce, stamp and retirement", () => {
    let s = d.addFlyer(initialState(), "spades", 5, 100, 570, 250, 10);
    const id = s.flyers[0].id;
    s = advance(s, 0.1);
    expect(s.flyers[0]).toMatchObject({
      id,
      x: 125,
      y: C.FLOOR_Y,
      vy: -(10 + C.GRAVITY * 0.1) * C.BOUNCE_DAMP,
      vx: 250,
    });
    expect(s.trailStamps).toBe(1);
    s = d.setFlyerPosition(s, id, C.STAGE_W + 1, 50);
    s = advance(s, 0);
    expect(s.flyers).toEqual([]);
    expect(s.trailStamps).toBe(2);
    expect(s.cascadeDone).toBe(false);
  });
  it("keeps flyers moving when launching is off and stops only painting with its gate", () => {
    let s = d.setLaunching(d.setScreen(complete(), "won"), false);
    s = d.setLaunchClock(s, 0.5);
    s = d.addFlyer(s, "hearts", 3, 300, 0, 200, 0);
    s = d.setTrailPainting(s, false);
    s = advance(s, 0.1);
    expect(s.launchClock).toBe(0.5);
    expect(s.launched).toBe(0);
    expect(s.flyers[0].x).toBe(320);
    expect(s.trailStamps).toBe(0);
    s = d.setTrailPainting(s, true);
    s = advance(s, 0.1);
    expect(s.trailStamps).toBe(1);
  });
  it("constant horizontal motion and simTime are independent of frame partition", () => {
    const s = d.addFlyer(initialState(), "hearts", 2, 0, 0, 180, 0);
    const one = advance(s, 1);
    let many = s;
    for (let i = 0; i < 60; i++) many = advance(many, 1 / 60);
    expect(many.simTime).toBeCloseTo(one.simTime);
    expect(many.flyers[0].x).toBeCloseTo(one.flyers[0].x);
  });
  it("finishes after 52 launches and the last retirement; a press starts fresh", () => {
    let s = advance(complete(), 0);
    for (let i = 0; i < 300; i++) s = advance(s, 0.1);
    expect(s.launched).toBe(C.DECK_SIZE);
    expect(s.flyers).toHaveLength(0);
    expect(s.cascadeDone).toBe(true);
    expect(s.trailStamps).toBeGreaterThan(100);
    s = d.pointerDown(s, 500, 500);
    expect(s.screen).toBe("playing");
    expect(s.trailStamps).toBe(0);
    expect(s.trail).toBeNull();
    expect(s.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(s.cascadeDone).toBe(false);
  });
  it("draws uniform magnitudes with independent signs", () => {
    const random = vi.spyOn(Math, "random");
    random.mockReturnValueOnce(0).mockReturnValueOnce(0.1);
    expect(drawLaunchVx()).toBe(-C.LAUNCH_VX_MIN);
    random.mockReturnValueOnce(0.5).mockReturnValueOnce(0.9);
    expect(drawLaunchVx()).toBe((C.LAUNCH_VX_MIN + C.LAUNCH_VX_MAX) / 2);
    random.mockRestore();
  });
});

describe("debug transactions", () => {
  it("poses on any screen and copies snapshot arrays", () => {
    let s = card(initialState(), "stock", 0, 1, "diamonds", true);
    s = d.addWasteSet(s, 2);
    s = d.setTitleIndex(s, 1);
    s = d.setMenuIndex(s, 1);
    expect(color(s.stock[0])).toBe("red");
    const shot = snapshot(s);
    shot.stock.pop();
    expect(s.stock).toHaveLength(1);
    s = d.setScreen(s, "playing");
    expect(s.menuIndex).toBe(1);
    expect(s.titleIndex).toBe(1);
    expect(s.wasteSets).toEqual([2]);
    const r = d.reset({ ...s, muted: true });
    expect(r).toEqual(initialState(true));
  });
  it("clears piles and table with precisely scoped effects", () => {
    let s = deal(playing());
    s = turnStock(s);
    s = d.addFlyer(s, "hearts", 5, 20, 20, 2, 3);
    s = advance(s, 0.1);
    const count = s.trailStamps;
    s = d.clearPile(s, "waste", 0);
    expect(s.wasteSets).toEqual([]);
    expect(s.stock).not.toHaveLength(0);
    s = d.clearTable(s);
    expect(s.flyers).toHaveLength(1);
    expect(s.trailStamps).toBe(count);
    expect(s.tableau).toHaveLength(C.TABLEAU_COLUMNS);
    s = d.clearTrail(s);
    expect(s.trailStamps).toBe(0);
    expect(s.flyers).toHaveLength(1);
    s = d.clearFlyers(s);
    expect(s.flyers).toHaveLength(0);
  });
  it("poses flyer position and velocity and removes by id", () => {
    let s = d.addFlyer(initialState(), "clubs", 4, 10, 20, 30, 40);
    const id = s.flyers[0].id;
    s = d.setFlyerPosition(s, id, 50, 60);
    s = d.setFlyerVelocity(s, id, 70, 80);
    expect(s.flyers[0]).toMatchObject({ x: 50, y: 60, vx: 70, vy: 80 });
    s = d.removeFlyer(s, id);
    expect(s.flyers).toEqual([]);
  });
  it("reconciles without advancing anything, even an offstage flyer", () => {
    let s = d.addFlyer(playing(), "hearts", 1, 2000, 800, 2, 3);
    s = d.setLaunchClock(s, 1);
    const before = snapshot(s);
    expect(snapshot(d.reconcile(s))).toEqual(before);
    expect(d.reconcile(d.reconcile(s))).toEqual(d.reconcile(s));
  });
  it("fails loudly on nonexistent entities, invalid piles and noninteger counts", () => {
    const s = initialState();
    expect(() => d.removeCard(s, 99)).toThrow();
    expect(() => d.removeFlyer(s, 99)).toThrow();
    expect(() => d.clearPile(s, "foundation", 4)).toThrow();
    expect(() => d.addWasteSet(s, 1.2)).toThrow();
    expect(() => d.addCard(s, "stock", 1, "clubs", 3, true)).toThrow();
    expect(() => d.addCard(s, "stock", 0, "clubs", 14, true)).toThrow();
    expect(() => d.setScreen(s, "invalid" as "title")).toThrow();
    expect(() => d.setMenuIndex(s, 7)).toThrow();
    expect(() => d.setLaunchClock(s, NaN)).toThrow();
  });
  it("deduplicates event names at the caller and distinguishes home, drop, flip and win", () => {
    const cues: string[] = [];
    const cue = (c: C.CueName) => cues.push(c);
    let s = card(playing(), "tableau", 0, 3, "clubs", false);
    s = card(s, "tableau", 0, 1, "hearts");
    s = pointerEvent(s, "down", 230, 214, cue);
    s = pointerEvent(s, "up", C.FOUNDATION_X[0] + 6, C.TOP_ROW_Y + 10, cue);
    expect(cues).toEqual([C.CUES.lift, C.CUES.drop, C.CUES.flip, C.CUES.home]);
    expect(s.foundations[0]).toHaveLength(1);
  });
});
