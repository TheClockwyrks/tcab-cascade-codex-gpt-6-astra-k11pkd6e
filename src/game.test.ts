import { afterEach, describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { BACKGROUND, game } from "./game";
import type { CascadeDebugApi, CascadeState } from "./game";
import * as C from "./constants";

const engines: Engine<CascadeState, CascadeDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function harness(width = C.STAGE_W, height = C.STAGE_H, dpr = 1) {
  const events = new EventTarget(),
    canvas = createCanvas(width, height);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => width,
      cssHeight: () => height,
      dpr: () => dpr,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") => {
    const event = new Event(type);
    Object.defineProperties(event, {
      code: { value: code },
      repeat: { value: false },
    });
    events.dispatchEvent(event);
  };
  const pointer = (type: string, x: number, y: number, device = "mouse") => {
    const event = new Event(`pointer${type}`);
    Object.defineProperties(event, {
      clientX: { value: x },
      clientY: { value: y },
      pointerId: { value: 1 },
      pointerType: { value: device },
      isPrimary: { value: true },
      button: { value: 0 },
      buttons: { value: type === "up" ? 0 : 1 },
    });
    events.dispatchEvent(event);
  };
  return { engine, canvas, key, pointer };
}

describe("engine integration", () => {
  it("registers exactly four actions and ten distinct audio cues", async () => {
    const registrations: string[] = [];
    const cues: string[] = [];
    const original = game.initialize;
    const inspected = {
      ...game,
      initialize: (api: Parameters<typeof original>[0]) =>
        original({
          ...api,
          input: {
            ...api.input,
            register: (name, binding) => {
              registrations.push(name);
              api.input.register(name, binding);
            },
          },
          audio: {
            ...api.audio,
            define: (name, spec) => {
              cues.push(name);
              api.audio.define(name, spec);
            },
          },
        }),
    };
    const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
    const engine = createEngine({
      canvas: canvas as unknown as HTMLCanvasElement,
      width: C.STAGE_W,
      height: C.STAGE_H,
      game: inspected,
      surface: {
        cssWidth: () => C.STAGE_W,
        cssHeight: () => C.STAGE_H,
        dpr: () => 1,
        events: () => new EventTarget(),
      },
    });
    engines.push(engine);
    await engine.initialize();
    expect(registrations).toEqual(Object.keys(C.MENU_BINDINGS));
    expect(cues).toEqual(Object.values(C.CUES));
    expect(engine.debug.version).toBe(C.CASCADE_DEBUG_VERSION);
  });
  it("keyboard priority, held-key edges, back navigation and remembered selection", async () => {
    const { engine: e, key } = await harness();
    key("ArrowUp");
    key("ArrowDown");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    await e.advance(1);
    expect(e.state.menuIndex).toBe(1);
    key("Enter", "keyup");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    expect(e.state.menuIndex).toBe(0);
    key("Escape");
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
    key("ArrowUp", "keyup");
    key("ArrowUp");
    await e.advance(1);
    expect(e.state.menuIndex).toBe(0);
    key("Enter", "keyup");
    key("Enter");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.menuIndex).toBe(0);
  });
  it("processes a complete touch click inside a single frame and emits one deal cue", async () => {
    const { engine: e, pointer } = await harness();
    const cues: string[] = [];
    e.events.on("cue:played", (event) => cues.push(event.cue));
    const r = e.debug.menuItemRect(e.state, 0)!;
    pointer("down", r.x + 10, r.y + 10, "touch");
    pointer("up", r.x + 10, r.y + 10, "touch");
    await e.advance(1);
    expect(e.state.screen).toBe("playing");
    expect(e.state.stock).toHaveLength(C.DEAL_STOCK_CARDS);
    expect(cues).toEqual([C.CUES.deal]);
    pointer("down", C.STOCK_X + 10, C.TOP_ROW_Y + 10, "touch");
    pointer("up", C.STOCK_X + 10, C.TOP_ROW_Y + 10, "touch");
    pointer("down", C.STOCK_X + 10, C.TOP_ROW_Y + 10, "touch");
    pointer("up", C.STOCK_X + 10, C.TOP_ROW_Y + 10, "touch");
    await e.advance(1);
    expect(e.state.waste).toHaveLength(C.TURN_COUNT * 2);
    expect(cues.filter((c) => c === C.CUES.turn)).toHaveLength(1);
  });
  it("toggles the runtime mute from the HUD and keeps playing", async () => {
    const { engine: e, pointer } = await harness();
    const gains: number[] = [];
    e.events.on("cue:played", (event) => gains.push(event.gain));
    e.apply((s) => ({ ...e.debug.deal(s), screen: "playing" }));
    const sound = e.debug.menuItemRect(e.state, 2)!;
    pointer("down", sound.x + 5, sound.y + 5);
    pointer("up", sound.x + 5, sound.y + 5);
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    pointer("down", C.STOCK_X + 5, C.TOP_ROW_Y + 5);
    pointer("up", C.STOCK_X + 5, C.TOP_ROW_Y + 5);
    await e.advance(1);
    expect(gains[gains.length - 1]).toBe(0);
    pointer("down", sound.x + 5, sound.y + 5);
    pointer("up", sound.x + 5, sound.y + 5);
    await e.advance(1);
    expect(e.state.muted).toBe(false);
  });
  it("renders every screen and cards to a real canvas without mutating the state", async () => {
    const { engine: e, canvas } = await harness();
    await e.advance(1);
    const title = canvas.toBuffer("image/png");
    e.apply((s) => e.debug.setScreen(s, "howto"));
    await e.advance(1);
    expect(canvas.toBuffer("image/png")).not.toEqual(title);
    e.apply((s) => ({ ...e.debug.deal(s), screen: "playing" }));
    await e.advance(1);
    e.apply((s) => e.debug.turnStock(s));
    await e.advance(1);
    const before = e.debug.snapshot(e.state);
    game.render(e.state, {
      ctx: canvas.getContext("2d") as unknown as CanvasRenderingContext2D,
      frame: () => e.frame(),
      viewport: () => e.viewport(),
    });
    expect(e.debug.snapshot(e.state)).toEqual(before);
    e.apply((s) => e.debug.clearTable(s));
    e.apply((s) => e.debug.addCard(s, "tableau", 0, "hearts", 13, true));
    e.apply((s) =>
      e.debug.pointerDown(s, C.COLUMN_X[0] + 10, C.TABLEAU_Y + 10),
    );
    e.apply((s) =>
      e.debug.pointerMove(s, C.COLUMN_X[1] + 10, C.TABLEAU_Y + 10),
    );
    await e.advance(1);
    expect(e.state.dropTarget?.index).toBe(1);
    e.apply((s) => e.debug.setScreen(s, "won"));
    e.apply((s) => e.debug.addFlyer(s, "clubs", 12, 400, 200, 200, 100));
    await e.advance(1);
    expect(e.state.trailStamps).toBe(1);
    e.apply((s) => ({ ...e.debug.clearFlyers(s), launched: C.DECK_SIZE }));
    await e.advance(1);
    expect(e.state.cascadeDone).toBe(true);
  });
  it("scales and letterboxes through the engine and exposes pure diagnostics", async () => {
    const { engine: e } = await harness(600, 900, 2);
    await e.advance(1);
    expect(e.viewport().scale).toBeCloseTo(1200 / C.STAGE_W);
    const before = e.debug.snapshot(e.state),
      readings = e.diagnostics();
    expect(readings.find((r) => r.name === "screen")?.value).toBe("title");
    expect(readings.find((r) => r.name === "dealMode")?.value).toBe(
      C.DEAL_MODE,
    );
    expect(readings.some((r) => r.error)).toBe(false);
    expect(e.debug.snapshot(e.state)).toEqual(before);
  });
  it("records genuine draw operations for replay", async () => {
    const { engine: e } = await harness();
    e.apply((s) => ({ ...e.debug.deal(s), screen: "playing" }));
    e.startRecording();
    await e.advance(2);
    const recording = e.stopRecording();
    expect(recording.frames).toHaveLength(2);
    expect(recording.ops.length).toBeGreaterThan(100);
    expect(recording.frames.every((f) => !f.truncated)).toBe(true);
  });
});
