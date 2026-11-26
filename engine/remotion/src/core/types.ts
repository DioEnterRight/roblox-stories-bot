/**
 * Reel engine: shared contracts.
 * Everything a niche module, a pipeline script or a skill touches is typed here.
 * Times are SECONDS on the reel timeline unless the name ends in `Frame`.
 */
import type React from "react";

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** One spoken word with absolute timing (from pipeline/voice.mjs → words.json). */
export type Word = {
  w: string;
  s: number;
  e: number;
  /** Marked by the planner: this word is a caption accent (red italic serif, highlight chip…). */
  accent?: boolean;
};

/** One voiced line (one TTS call). `speaker` is a role name: NARRATOR, CEO, MOM … */
export type Line = {
  id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
  words: Word[];
  /** Relative path (inside the project folder) to this line's own mp3 — used for lip-sync envelopes. */
  audio?: string;
};

export type TransitionType =
  | "cut"
  | "pop"
  | "slide"
  | "whip"
  | "zoom-kick"
  | "fade"
  | "stamp"
  | "drop"
  | "halftone"
  | "none";

export type Transition = {
  type: TransitionType;
  /** Seconds. Defaults per niche style. */
  durationSec?: number;
  dir?: "left" | "right" | "up" | "down";
};

/** A character placed in a 3D (or 2D) scene. */
export type CastMember = {
  id: string;
  /** Character id registered by the niche (e.g. "ceo", "mom", "investor"). */
  character: string;
  at?: [number, number, number];
  rotY?: number;
  scale?: number;
  /** Named action: idle | hop | talk | point | wave | look | walk | shake | celebrate … (niche-defined). */
  action?: string;
  /** Named expression: neutral | happy | angry | sad | surprised | squint | closed … (niche-defined). */
  expression?: string;
  /** Free-form per-character props (hat, label text, colour variant…). */
  props?: Record<string, unknown>;
  /** Lip-sync: the speaker role whose audio drives the mouth. */
  speaks?: string;
};

export type CameraSpec = {
  /** Named rig registered by the niche: static | push-in | pull-out | orbit | dolly | crane | whip-to | handheld. */
  rig: string;
  /** Rig parameters (from/to positions, fov, amount, target…). */
  params?: Record<string, unknown>;
};

/** A word-anchored event inside a scene (a stamp slams, a counter starts, a prop appears). */
export type Anchor = {
  /** Event name the archetype listens to (e.g. "stamp", "count", "reveal"). */
  fire: string;
  /** Absolute time in seconds (resolved by pipeline/plan.mjs from a word reference). */
  at: number;
  payload?: Record<string, unknown>;
};

export type Scene = {
  id: string;
  /** Archetype id registered by the niche module. */
  archetype: string;
  start: number;
  end: number;
  props: Record<string, unknown>;
  /** Small chapter label (paper niche: "// 01 · the proof"). */
  label?: string;
  /** Right-hand label (paper niche: "UNDERSTANDING 63%"). */
  labelRight?: string;
  /** Big display text / title card (a card or strip). */
  display?: { text: string; accent?: string[]; sub?: string };
  transitionIn?: Transition;
  transitionOut?: Transition;
  set?: string;
  cast?: CastMember[];
  camera?: CameraSpec;
  anchors?: Anchor[];
  /** Per-scene caption overrides (hide captions during a full-screen insert, change position…). */
  captions?: Partial<CaptionSpec> & { hidden?: boolean };
};

export type CaptionSpec = {
  /** Renderer id registered by the niche: "editorial" | "chips" | "subtitle" | … */
  mode: string;
  /** Seconds a word appears BEFORE it is spoken. */
  leadSec: number;
  /** How words are grouped on screen. */
  groupBy: "word" | "phrase" | "line";
  /** Max words in a phrase group (groupBy=phrase). */
  maxWords?: number;
  /** Split phrases at silences longer than this (seconds). */
  gapSplitSec?: number;
  /** Seconds a finished group stays visible after its last word ends (before the next group). */
  holdSec?: number;
  /** Words (case-insensitive) to mark as accents when the planner did not mark them explicitly. */
  accentWords?: string[];
  /** Renderer-specific knobs. */
  params?: Record<string, unknown>;
};

export type AudioSpec = {
  /** Mastered voice track, relative to the project folder (e.g. "audio.master.wav"). */
  voice: string;
  /** mutes: windows (seconds, resolved by plan.mjs from word refs) where the bed drops to digital silence, 0.06 s ramps. */
  music?: { file: string; gainDb: number; fadeOutSec?: number; fadeInSec?: number; startAt?: number; mutes?: Array<{ from: number; to: number }>; /** dB applied to the bed while someone speaks (e.g. -3); swells back in the gaps */ duckDb?: number; duckRampSec?: number };
  sfx?: Array<{ file: string; at: number; gainDb?: number }>;
};

export type ReelMeta = {
  title: string;
  topic: string;
  hook?: string;
  cta?: { keyword: string; line: string };
  creator?: string;
  /** Channel branding: corner handle on every frame + the follow outro (pipeline/branding.py). */
  brand?: { corner?: string; outro?: { start: number; headline: string; sub: string; minSec: number } };
  /** Free notes from the planner for QA agents. */
  notes?: string;
};

/** The fully resolved edit decision list rendered by <Reel/>. Written by pipeline/plan.mjs. */
export type ReelSpec = {
  version: 1;
  niche: string;
  slug: string;
  meta: ReelMeta;
  fps: number;
  width: number;
  height: number;
  durationSec: number;
  audio: AudioSpec;
  lines: Line[];
  captions: CaptionSpec;
  scenes: Scene[];
  /** Overrides of the niche style (palette, fonts…). Shallow-merged over style.json. */
  style?: Record<string, unknown>;
};

/** Word state computed by the captions core for the current frame. */
export type CaptionWord = Word & {
  appearAt: number;
  /** seconds since the word appeared (negative = not yet) */
  age: number;
  state: "upcoming" | "current" | "spoken";
  index: number;
};

export type CaptionState = {
  visible: boolean;
  lineIndex: number;
  line?: Line;
  groupIndex: number;
  /** Words of the active group, in order (all of them, incl. upcoming — renderers decide what to draw). */
  words: CaptionWord[];
  /** Time (s) the group became active. */
  groupStart: number;
  /** Time (s) the group ends (last word end + hold). */
  groupEnd: number;
  speaker: string;
  t: number;
};

export type CaptionRendererProps = {
  state: CaptionState;
  reel: ReelSpec;
  scene?: Scene;
  style: StyleSpec;
  frame: number;
};

export type StyleSpec = {
  id: string;
  palette: Record<string, string>;
  fonts: Record<string, { family: string; source: "google" | "local"; file?: string; weights?: number[] }>;
  captions: CaptionSpec;
  transitions: { defaultIn: Transition; defaultOut: Transition };
  texture?: Record<string, unknown>;
  post?: Record<string, unknown>;
  layout?: Record<string, number>;
  /** Any niche-specific constants. */
  [key: string]: unknown;
};

export type ArchetypeDef = {
  id: string;
  description: string;
  /** For planners: what props are accepted, with examples. */
  props: Record<string, string>;
  /** Suggested duration range in seconds. */
  duration?: [number, number];
  /** Is this a full-screen insert that hides captions by default? */
  fullscreen?: boolean;
  component: React.FC<SceneComponentProps>;
};

export type SceneComponentProps = {
  scene: Scene;
  reel: ReelSpec;
  style: StyleSpec;
  /** Seconds since the scene started (can be negative during pre-roll, > length during out-transition). */
  localT: number;
  /** 0..1 progress of the in-transition, 1 when settled. */
  inProgress: number;
  /** 0..1 progress of the out-transition, 0 until it starts. */
  outProgress: number;
  /** The absolute reel time in seconds. */
  t: number;
  frame: number;
  /** Words of the current caption group (so a card can react to the spoken word). */
  captionState: CaptionState;
};

export type NicheModule = {
  id: string;
  displayName: string;
  family: "2d" | "3d";
  style: StyleSpec;
  /** Everything under the caption layer: 2D card sequencer or a persistent 3D canvas. */
  Stage: React.FC<{ reel: ReelSpec; style: StyleSpec; captionState: CaptionState }>;
  /** Everything above captions: grain, vignette, watermark, chapter labels… */
  Overlay?: React.FC<{ reel: ReelSpec; style: StyleSpec; captionState: CaptionState }>;
  captionRenderers: Record<string, React.FC<CaptionRendererProps>>;
  archetypes: Record<string, ArchetypeDef>;
  /** Called once at module load (fonts). */
  loadFonts?: () => void;
};
