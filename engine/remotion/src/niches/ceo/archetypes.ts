/**
 * Scene vocabulary. Every scene is a fully specified "Shot" (set + mood + cast + camera + overlays) written by the
 * compiler (pipeline/compiler.py), so there are no hidden defaults to drift out of sync with the Python side.
 */
import type { ArchetypeDef, Scene } from "../../core/types";

const Null: ArchetypeDef["component"] = () => null;

export const withDefaults = (scene: Scene | undefined): Scene | undefined => scene;

export const archetypes: Record<string, ArchetypeDef> = {
  Shot: {
    id: "Shot",
    description: "A 3D shot: set + props.mood + cast + camera (+ cards, stamps, insert, sparkles, confetti).",
    props: {},
    duration: [0.8, 5],
    component: Null,
  },
};
