import * as C from "./constants";
import type {
  CardState,
  CascadeState,
  DropTargetState,
  FlyerState,
  PileKind,
  Screen,
  State,
  Suit,
} from "./game";
import {
  contains,
  hitCard,
  menuCount,
  menuItemRect,
  pileRect,
  top,
  visibleCount,
} from "./geometry";
export { menuCount } from "./geometry";
export type Cue = (name: C.CueName) => void;
const silent: Cue = () => {};
export const color = (card: Pick<CardState, "suit">): "red" | "black" =>
  card.suit === "hearts" || card.suit === "diamonds" ? "red" : "black";
const emptyFoundations = (): CardState[][] =>
  Array.from({ length: C.FOUNDATION_COUNT }, () => []);
const emptyTableau = (): CardState[][] =>
  Array.from({ length: C.TABLEAU_COLUMNS }, () => []);
export function initialState(muted = false): CascadeState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: emptyFoundations(),
    tableau: emptyTableau(),
    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: 1,
    simTime: 0,
    muted,
    trail: null,
  };
}
function integer(n: number, min = 0, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(n) || n < min || n > max)
    throw new RangeError(`Invalid integer: ${n}`);
}
function face(suit: Suit, rank: number): void {
  if (!C.SUITS.includes(suit)) throw new RangeError(`Invalid suit: ${suit}`);
  integer(rank, C.RANK_MIN, C.RANK_MAX);
}
function finite(...numbers: number[]): void {
  if (numbers.some((n) => !Number.isFinite(n)))
    throw new RangeError("Expected finite coordinates");
}
export function pile(
  s: State,
  kind: PileKind,
  index: number,
): readonly CardState[] {
  switch (kind) {
    case "stock":
    case "waste":
      integer(index, 0, 0);
      return s[kind];
    case "foundation":
      integer(index, 0, C.FOUNDATION_COUNT - 1);
      return s.foundations[index];
    case "tableau":
      integer(index, 0, C.TABLEAU_COLUMNS - 1);
      return s.tableau[index];
    default:
      throw new RangeError(`Invalid pile: ${kind}`);
  }
}
function put(
  s: State,
  kind: PileKind,
  index: number,
  cards: readonly CardState[],
): CascadeState {
  pile(s, kind, index);
  if (kind === "stock" || kind === "waste") return { ...s, [kind]: cards };
  const key = kind === "foundation" ? "foundations" : "tableau";
  return { ...s, [key]: s[key].map((p, i) => (i === index ? cards : p)) };
}
function locate(
  s: State,
  id: number,
): { kind: PileKind; index: number; row: number } {
  for (const kind of ["stock", "waste", "foundation", "tableau"] as const) {
    const count =
      kind === "foundation"
        ? C.FOUNDATION_COUNT
        : kind === "tableau"
          ? C.TABLEAU_COLUMNS
          : 1;
    for (let index = 0; index < count; index++) {
      const row = pile(s, kind, index).findIndex((c) => c.id === id);
      if (row >= 0) return { kind, index, row };
    }
  }
  throw new RangeError(`No card with id ${id}`);
}
function spendWaste(s: State): CascadeState {
  const counts = [...s.wasteSets];
  while (counts.length && top(counts) === 0) counts.pop();
  if (counts.length) {
    counts[counts.length - 1]--;
    if (top(counts) === 0) counts.pop();
  }
  return { ...s, wasteSets: counts };
}
export function clearTrail(s: State): CascadeState {
  return { ...s, trail: null, trailStamps: 0 };
}
export function deal(s: State, cue: Cue = silent): CascadeState {
  const cards: CardState[] = [];
  let nextId = s.nextId;
  for (const suit of C.SUITS)
    for (let rank = C.RANK_MIN; rank <= C.RANK_MAX; rank++)
      cards.push({ id: nextId++, suit, rank, faceUp: false });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  let cursor = 0;
  const tableau = Array.from({ length: C.TABLEAU_COLUMNS }, (_, i) =>
    cards
      .slice(cursor, (cursor += i + 1))
      .map((c, j) => ({ ...c, faceUp: j === i })),
  );
  cue(C.CUES.deal);
  return {
    ...clearTrail(s),
    nextId,
    tableau,
    stock: cards.slice(
      C.DEAL_TABLEAU_CARDS,
      C.DEAL_TABLEAU_CARDS + C.DEAL_STOCK_CARDS,
    ),
    waste: [],
    wasteSets: [],
    foundations: emptyFoundations(),
    launched: 0,
  };
}
export function turnStock(s: State, cue: Cue = silent): CascadeState {
  if (s.stock.length) {
    const n = Math.min(C.TURN_COUNT, s.stock.length);
    cue(C.CUES.turn);
    return {
      ...s,
      stock: s.stock.slice(0, -n),
      waste: [
        ...s.waste,
        ...s.stock
          .slice(-n)
          .reverse()
          .map((c) => ({ ...c, faceUp: true })),
      ],
      wasteSets: [...s.wasteSets, n],
    };
  }
  if (s.waste.length) {
    cue(C.CUES.recycle);
    return {
      ...s,
      stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      wasteSets: [],
    };
  }
  return { ...s };
}
function validRun(cards: readonly CardState[]): boolean {
  return (
    cards.length > 0 &&
    cards.every(
      (c, i) =>
        c.faceUp &&
        (i === 0 ||
          (cards[i - 1].rank === c.rank + 1 &&
            color(cards[i - 1]) !== color(c))),
    )
  );
}
function canTake(
  s: State,
  kind: PileKind,
  index: number,
  row: number,
): boolean {
  const cards = pile(s, kind, index);
  if (kind === "stock" || row < 0 || row >= cards.length || !cards[row].faceUp)
    return false;
  if (kind !== "tableau" && row !== cards.length - 1) return false;
  if (kind === "waste" && visibleCount(s) <= 0) return false;
  return validRun(cards.slice(row));
}
function accepts(
  s: State,
  cards: readonly CardState[],
  from: PileKind,
  fromIndex: number,
  to: PileKind,
  index: number,
): boolean {
  const dest = pile(s, to, index),
    last = top(dest),
    first = cards[0];
  if ((from === to && fromIndex === index) || !validRun(cards)) return false;
  if (to === "foundation")
    return (
      from !== "foundation" &&
      cards.length === 1 &&
      (last
        ? last.faceUp &&
          first.suit === last.suit &&
          first.rank === last.rank + 1
        : first.rank === C.RANK_MIN)
    );
  if (to === "tableau")
    return last
      ? last.faceUp &&
          last.rank === first.rank + 1 &&
          color(last) !== color(first)
      : first.rank === C.RANK_MAX;
  return false;
}
function detectWin(s: State, cue: Cue): CascadeState {
  if (!s.winDetect || s.screen === "won") return { ...s };
  const complete = s.foundations.every(
    (p) =>
      p.length === C.RANK_MAX &&
      p.every(
        (c, i) => c.faceUp && c.rank === i + C.RANK_MIN && c.suit === p[0].suit,
      ),
  );
  if (
    !complete ||
    new Set(s.foundations.map((p) => p[0].suit)).size !== C.FOUNDATION_COUNT
  )
    return { ...s };
  cue(C.CUES.win);
  return {
    ...s,
    screen: "won",
    stock: [],
    waste: [],
    wasteSets: [],
    tableau: emptyTableau(),
    drag: null,
    dropTarget: null,
    launchClock: C.LAUNCH_INTERVAL,
    launched: 0,
    flyers: [],
    cascadeDone: false,
  };
}
function afterMove(
  s: State,
  from: PileKind,
  index: number,
  to: PileKind,
  cue: Cue,
): CascadeState {
  let next: CascadeState = { ...s };
  if (from === "waste") next = spendWaste(next);
  if (from === "tableau" && next.autoFlip) {
    const p = next.tableau[index],
      last = top(p);
    if (last && !last.faceUp) {
      next = put(next, from, index, [
        ...p.slice(0, -1),
        { ...last, faceUp: true },
      ]);
      cue(C.CUES.flip);
    }
  }
  if (to === "foundation") cue(C.CUES.home);
  return detectWin(next, cue);
}
export function move(
  s: State,
  from: PileKind,
  fromIndex: number,
  row: number,
  to: PileKind,
  toIndex: number,
  cue: Cue = silent,
): [CascadeState, boolean] {
  const source = pile(s, from, fromIndex);
  pile(s, to, toIndex);
  integer(row);
  if (
    !canTake(s, from, fromIndex, row) ||
    !accepts(s, source.slice(row), from, fromIndex, to, toIndex)
  )
    return [{ ...s }, false];
  let next = put(s, from, fromIndex, source.slice(0, row));
  next = put(next, to, toIndex, [
    ...pile(next, to, toIndex),
    ...source.slice(row),
  ]);
  return [afterMove(next, from, fromIndex, to, cue), true];
}
export function autoMove(
  s: State,
  kind: PileKind,
  index: number,
  cue: Cue = silent,
): [CascadeState, boolean] {
  const p = pile(s, kind, index);
  if (kind !== "waste" && kind !== "tableau") return [{ ...s }, false];
  if (!p.length) return [{ ...s }, false];
  for (let i = 0; i < C.FOUNDATION_COUNT; i++) {
    const result = move(s, kind, index, p.length - 1, "foundation", i, cue);
    if (result[1]) return result;
  }
  return [{ ...s }, false];
}
export function target(s: State): DropTargetState | null {
  const d = s.drag;
  if (!d) return null;
  const x = d.x + C.CARD_W / 2,
    y = d.y + C.CARD_H / 2;
  for (const kind of ["foundation", "tableau"] as const)
    for (
      let i = 0;
      i < (kind === "foundation" ? C.FOUNDATION_COUNT : C.TABLEAU_COLUMNS);
      i++
    ) {
      if (
        contains(pileRect(s, kind, i), x, y) &&
        accepts(s, d.cards, d.fromPile, d.fromIndex, kind, i)
      )
        return { pile: kind, index: i };
    }
  return null;
}
function returnHand(s: State): CascadeState {
  const d = s.drag;
  return d
    ? {
        ...put(s, d.fromPile, d.fromIndex, [
          ...pile(s, d.fromPile, d.fromIndex),
          ...d.cards,
        ]),
        drag: null,
        dropTarget: null,
      }
    : { ...s };
}
function beginPlay(s: State, cue: Cue): CascadeState {
  return {
    ...deal(s, cue),
    screen: "playing",
    menuIndex: 0,
    drag: null,
    dropTarget: null,
    lastPress: null,
    pointer: { ...s.pointer, down: false },
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    flyers: [],
    cascadeDone: false,
  };
}
export function activate(s: State, cue: Cue = silent): CascadeState {
  if (s.screen === "title") {
    const n = { ...s, titleIndex: s.menuIndex };
    return s.menuIndex === 0
      ? beginPlay(n, cue)
      : { ...n, screen: "howto", menuIndex: 0 };
  }
  if (s.screen === "howto" || (s.screen === "playing" && s.menuIndex === 1))
    return { ...returnHand(s), screen: "title", menuIndex: s.titleIndex };
  if (s.screen === "playing")
    return s.menuIndex === 0 ? beginPlay(s, cue) : { ...s, muted: !s.muted };
  return { ...s };
}
export function pointerEvent(
  state: State,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  cue: Cue = silent,
): CascadeState {
  finite(x, y);
  let s: CascadeState = {
    ...state,
    pointer: {
      x,
      y,
      down: type === "down" ? true : type === "up" ? false : state.pointer.down,
    },
  };
  if (s.drag)
    s = {
      ...s,
      drag: {
        ...s.drag,
        x: s.drag.x + x - state.pointer.x,
        y: s.drag.y + y - state.pointer.y,
      },
    };
  for (let i = 0; i < menuCount(s); i++) {
    const rect = menuItemRect(s, i);
    if (rect && contains(rect, x, y)) s = { ...s, menuIndex: i };
  }
  if (type === "down") {
    const previous = state.lastPress;
    s = { ...s, lastPress: { x, y, at: s.simTime } };
    if (s.screen === "won")
      return { ...beginPlay(s, cue), lastPress: { x, y, at: s.simTime } };
    if (s.screen !== "playing") return s;
    const hit = hitCard(s, x, y);
    if (!hit) return s;
    const p = pile(s, hit.pile, hit.index);
    if (
      previous &&
      s.simTime - previous.at <= C.DOUBLE_CLICK_WINDOW &&
      Math.hypot(x - previous.x, y - previous.y) <= C.DOUBLE_CLICK_SLOP &&
      hit.pile !== "foundation" &&
      hit.row === p.length - 1 &&
      p[hit.row].faceUp &&
      (hit.pile !== "waste" || visibleCount(s) > 0)
    ) {
      const [next] = autoMove(s, hit.pile, hit.index, cue);
      return { ...next, pointer: { x, y, down: false } };
    }
    if (!p[hit.row].faceUp || (hit.pile === "waste" && visibleCount(s) <= 0))
      return s;
    cue(C.CUES.lift);
    s = {
      ...put(s, hit.pile, hit.index, p.slice(0, hit.row)),
      drag: {
        cards: p.slice(hit.row),
        fromPile: hit.pile,
        fromIndex: hit.index,
        x: hit.x,
        y: hit.y,
      },
    };
  } else if (type === "up" && state.pointer.down && s.lastPress) {
    const press = s.lastPress;
    if (Math.hypot(x - press.x, y - press.y) <= C.DRAG_THRESHOLD) {
      s = returnHand(s);
      if (
        s.screen === "playing" &&
        contains(pileRect(s, "stock", 0), press.x, press.y)
      )
        s = turnStock(s, cue);
    } else if (s.drag) {
      const d = s.drag,
        t = target(s);
      if (t) {
        s = {
          ...put(s, t.pile, t.index, [...pile(s, t.pile, t.index), ...d.cards]),
          drag: null,
          dropTarget: null,
        };
        cue(C.CUES.drop);
        s = afterMove(s, d.fromPile, d.fromIndex, t.pile, cue);
      } else {
        s = returnHand(s);
        cue(C.CUES.reject);
      }
    }
    for (let i = 0; i < menuCount(s); i++) {
      const rect = menuItemRect(s, i);
      if (rect && contains(rect, press.x, press.y) && contains(rect, x, y)) {
        s = activate({ ...s, menuIndex: i }, cue);
        break;
      }
    }
  }
  return { ...s, dropTarget: target(s) };
}
export function drawLaunchVx(): number {
  return (
    (C.LAUNCH_VX_MIN + Math.random() * (C.LAUNCH_VX_MAX - C.LAUNCH_VX_MIN)) *
    (Math.random() < 0.5 ? -1 : 1)
  );
}
export function advance(
  state: State,
  dt: number,
  cue: Cue = silent,
): CascadeState {
  let s: CascadeState = { ...state, simTime: state.simTime + dt };
  if (s.screen === "playing") s = detectWin(s, cue);
  // Posed flyers are physical entities on every screen; launching belongs to won.
  const stamps: FlyerState[] = [];
  const flyers = s.flyers
    .map((f) => {
      let vy = f.vy + C.GRAVITY * dt;
      const x = f.x + f.vx * dt;
      let y = f.y + vy * dt;
      if (y >= C.FLOOR_Y && vy > 0) {
        y = C.FLOOR_Y;
        vy = -vy * C.BOUNCE_DAMP;
      }
      const next = { ...f, x, y, vy };
      if (s.trailPainting) stamps.push(next);
      return next;
    })
    .filter((f) => f.x + C.CARD_W >= 0 && f.x <= C.STAGE_W);
  s = {
    ...s,
    flyers,
    trailStamps: s.trailStamps + stamps.length,
    trail: stamps.length ? { parent: s.trail, stamps } : s.trail,
  };
  if (s.screen === "won" && s.launching && !s.cascadeDone) {
    let clock = s.launchClock + dt,
      launched = s.launched;
    const foundations = s.foundations.map((p) => [...p]);
    const nextFlyers = [...s.flyers];
    while (clock >= C.LAUNCH_INTERVAL && foundations.some((p) => p.length)) {
      let index = launched % C.FOUNDATION_COUNT;
      while (!foundations[index].length)
        index = (index + 1) % C.FOUNDATION_COUNT;
      const card = foundations[index].pop()!;
      nextFlyers.push({
        id: card.id,
        suit: card.suit,
        rank: card.rank,
        x: C.FOUNDATION_X[index],
        y: C.TOP_ROW_Y,
        vx: drawLaunchVx(),
        vy: C.LAUNCH_VY,
      });
      launched++;
      clock -= C.LAUNCH_INTERVAL;
      cue(C.CUES.launch);
    }
    s = { ...s, foundations, flyers: nextFlyers, launched, launchClock: clock };
  }
  if (s.launched === C.DECK_SIZE && s.flyers.length === 0)
    s = { ...s, cascadeDone: true };
  return { ...s, dropTarget: target(s) };
}

export function snapshot(s: State) {
  const card = (c: CardState) => ({ ...c, color: color(c) });
  return {
    version: C.CASCADE_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    dealMode: C.DEAL_MODE,
    turnCount: C.TURN_COUNT,
    dealModeLabel: C.DEAL_MODE_LABEL,
    muted: s.muted,
    autoFlip: s.autoFlip,
    winDetect: s.winDetect,
    launching: s.launching,
    trailPainting: s.trailPainting,
    stock: s.stock.map(card),
    waste: s.waste.map(card),
    wasteSets: [...s.wasteSets],
    wasteVisibleCount: visibleCount(s),
    foundations: s.foundations.map((p) => p.map(card)),
    tableau: s.tableau.map((p) => p.map(card)),
    drag: s.drag ? { ...s.drag, cards: s.drag.cards.map(card) } : null,
    dropTarget: target(s),
    pointer: { ...s.pointer },
    lastPress: s.lastPress ? { ...s.lastPress } : null,
    launchClock: s.launchClock,
    launched: s.launched,
    flyers: s.flyers.map((f) => ({ ...f })),
    cascadeDone: s.cascadeDone,
    trailStamps: s.trailStamps,
    simTime: s.simTime,
  };
}
function changeFlyer(
  s: State,
  id: number,
  change: (f: FlyerState) => FlyerState,
): CascadeState {
  if (!s.flyers.some((f) => f.id === id))
    throw new RangeError(`No flyer with id ${id}`);
  return { ...s, flyers: s.flyers.map((f) => (f.id === id ? change(f) : f)) };
}
export function createDebug() {
  return {
    version: C.CASCADE_DEBUG_VERSION,
    reset: (s: State): CascadeState => initialState(s.muted),
    snapshot,
    reconcile: (s: State): CascadeState => ({ ...s, dropTarget: target(s) }),
    menuItemRect,
    setScreen: (s: State, screen: Screen): CascadeState => {
      if (!["title", "howto", "playing", "won"].includes(screen))
        throw new RangeError("Invalid screen");
      return { ...s, screen };
    },
    setMenuIndex: (s: State, menuIndex: number): CascadeState => {
      integer(menuIndex, 0, menuCount(s) - 1);
      return { ...s, menuIndex };
    },
    setTitleIndex: (s: State, titleIndex: number): CascadeState => {
      integer(titleIndex, 0, C.TITLE_ITEMS.length - 1);
      return { ...s, titleIndex };
    },
    addCard: (
      s: State,
      kind: PileKind,
      index: number,
      suit: Suit,
      rank: number,
      faceUp: boolean,
    ): CascadeState => {
      face(suit, rank);
      return {
        ...put(s, kind, index, [
          ...pile(s, kind, index),
          { id: s.nextId, suit, rank, faceUp },
        ]),
        nextId: s.nextId + 1,
      };
    },
    removeCard: (s: State, id: number): CascadeState => {
      const { kind, index, row } = locate(s, id);
      const next = put(
        s,
        kind,
        index,
        pile(s, kind, index).filter((_, i) => i !== row),
      );
      return kind === "waste" ? spendWaste(next) : next;
    },
    setCardFaceUp: (s: State, id: number, faceUp: boolean): CascadeState => {
      const { kind, index } = locate(s, id);
      return put(
        s,
        kind,
        index,
        pile(s, kind, index).map((c) => (c.id === id ? { ...c, faceUp } : c)),
      );
    },
    clearPile: (s: State, kind: PileKind, index: number): CascadeState => {
      const next = put(s, kind, index, []);
      return kind === "waste" ? { ...next, wasteSets: [] } : next;
    },
    clearTable: (s: State): CascadeState => ({
      ...s,
      stock: [],
      waste: [],
      wasteSets: [],
      foundations: emptyFoundations(),
      tableau: emptyTableau(),
      drag: null,
      dropTarget: null,
    }),
    addWasteSet: (s: State, count: number): CascadeState => {
      integer(count);
      return { ...s, wasteSets: [...s.wasteSets, count] };
    },
    clearWasteSets: (s: State): CascadeState => ({ ...s, wasteSets: [] }),
    deal,
    turnStock,
    move,
    autoMove,
    pointerDown: (s: State, x: number, y: number): CascadeState =>
      pointerEvent(s, "down", x, y),
    pointerMove: (s: State, x: number, y: number): CascadeState =>
      pointerEvent(s, "move", x, y),
    pointerUp: (s: State, x: number, y: number): CascadeState =>
      pointerEvent(s, "up", x, y),
    setAutoFlip: (s: State, autoFlip: boolean): CascadeState => ({
      ...s,
      autoFlip,
    }),
    setWinDetect: (s: State, winDetect: boolean): CascadeState => ({
      ...s,
      winDetect,
    }),
    setLaunching: (s: State, launching: boolean): CascadeState => ({
      ...s,
      launching,
    }),
    setTrailPainting: (s: State, trailPainting: boolean): CascadeState => ({
      ...s,
      trailPainting,
    }),
    addFlyer: (
      s: State,
      suit: Suit,
      rank: number,
      x: number,
      y: number,
      vx: number,
      vy: number,
    ): CascadeState => {
      face(suit, rank);
      finite(x, y, vx, vy);
      return {
        ...s,
        flyers: [...s.flyers, { id: s.nextId, suit, rank, x, y, vx, vy }],
        nextId: s.nextId + 1,
      };
    },
    setFlyerPosition: (
      s: State,
      id: number,
      x: number,
      y: number,
    ): CascadeState => {
      finite(x, y);
      return changeFlyer(s, id, (f) => ({ ...f, x, y }));
    },
    setFlyerVelocity: (
      s: State,
      id: number,
      vx: number,
      vy: number,
    ): CascadeState => {
      finite(vx, vy);
      return changeFlyer(s, id, (f) => ({ ...f, vx, vy }));
    },
    removeFlyer: (s: State, id: number): CascadeState => {
      changeFlyer(s, id, (f) => f);
      return { ...s, flyers: s.flyers.filter((f) => f.id !== id) };
    },
    clearFlyers: (s: State): CascadeState => ({ ...s, flyers: [] }),
    setLaunchClock: (s: State, launchClock: number): CascadeState => {
      finite(launchClock);
      return { ...s, launchClock };
    },
    clearTrail,
    drawLaunchVx: (_s: State): number => drawLaunchVx(),
  };
}
