/**
 * Dio's Stories — "jobless CEO" world (3D box cast in five locations × five moods).
 * Stage = one persistent R3F canvas (set, cast, camera, post) + a 2D overlay layer (cards, stamps, screen inserts);
 * captions = "karaoke" (outrichguy-style word-by-word caps with a yellow newest word).
 */
import type { NicheModule, StyleSpec } from "../../core/types";
import styleJson from "./style.json";
import { archetypes } from "./archetypes";
import { CeoOverlay } from "./Overlay";
import { Stage } from "./Stage";
import { KaraokeCaptions } from "./ui/Karaoke";

const style = styleJson as unknown as StyleSpec;

export const ceoNiche: NicheModule = {
  id: style.id,
  displayName: "Dio's Stories",
  family: "3d",
  style,
  Stage,
  Overlay: CeoOverlay,
  captionRenderers: { karaoke: KaraokeCaptions },
  archetypes,
};
