import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import {
  initialState,
  createDebug,
  advance,
  pointerEvent,
  activate,
  menuCount,
} from "./rules";
import { render } from "./drawing";

export type Screen = "title" | "howto" | "playing" | "won";

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";

export type PileKind = "stock" | "waste" | "foundation" | "tableau";

export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}

export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}

export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;

  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];

  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;

  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;

  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;

  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
  /** Immutable drawing commands for the persistent painted surface. */
  readonly trail: TrailLayer | null;
}

export interface TrailLayer {
  readonly parent: TrailLayer | null;
  readonly stamps: readonly FlyerState[];
}
export type State = DeepReadonly<CascadeState>;
export type CascadeDebugApi = ReturnType<typeof createDebug>;
export const BACKGROUND = "#103d39";

export const game: Game<CascadeState, CascadeDebugApi> = {
  initialize(api) {
    for (const [name, keys] of Object.entries(C.MENU_BINDINGS))
      api.input.register(name, { keys: [...keys] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i % 2 ? "sine" : "triangle",
        freq: 190 + i * 63,
        freqTo: 130 + i * 85,
        durationMs: 45 + i * 13,
        gain: 0.065,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("dealMode", () => C.DEAL_MODE);
    api.diagnostics.register("stock", (s) => s.stock.length);
    api.diagnostics.register("waste", (s) => s.waste.length);
    for (let i = 0; i < C.FOUNDATION_COUNT; i++)
      api.diagnostics.register(
        `foundation ${i}`,
        (s) => s.foundations[i].length,
      );
    for (let i = 0; i < C.TABLEAU_COLUMNS; i++)
      api.diagnostics.register(`column ${i}`, (s) => s.tableau[i].length);
    api.diagnostics.register("drag", (s) => s.drag !== null);
    api.diagnostics.register("held cards", (s) => s.drag?.cards.length ?? 0);
    api.diagnostics.register("launched", (s) => s.launched);
    api.diagnostics.register("flyers", (s) => s.flyers.length);
    return [initialState(), createDebug()];
  },
  update(state, api, dt) {
    const cues = new Set<C.CueName>();
    const cue = (name: C.CueName) => {
      cues.add(name);
    };
    let s: CascadeState = { ...state };
    // Debug gestures use the same state transition as physical gestures.
    if (s.muted !== api.audio.muted()) api.audio.setMuted(s.muted);
    for (const sample of api.input.pointerSamples()) {
      if (
        sample.primary &&
        (sample.type === "move" || sample.button === "primary")
      )
        s = pointerEvent(s, sample.type, sample.x, sample.y, cue);
    }
    if (s.screen !== "won") {
      const up = api.input.pressed(C.MENU_UP);
      const down = api.input.pressed(C.MENU_DOWN);
      if (up || down)
        s = {
          ...s,
          menuIndex:
            (s.menuIndex + (up ? -1 : 1) + menuCount(s)) % menuCount(s),
        };
      else if (
        api.input.pressed(C.MENU_CONFIRM) ||
        (s.screen === "howto" && api.input.pressed(C.MENU_BACK))
      )
        s = activate(s, cue);
    }
    if (s.muted !== api.audio.muted()) api.audio.setMuted(s.muted);
    s = advance(s, dt, cue);
    for (const name of cues) api.audio.play(name);
    return { ...s, muted: api.audio.muted() };
  },
  render(s, api) {
    render(s, api.ctx);
  },
};
