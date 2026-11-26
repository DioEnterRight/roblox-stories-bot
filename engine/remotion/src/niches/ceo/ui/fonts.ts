/**
 * Fonts ship inside the repo (public/assets/fonts, SIL Open Font License) so a render never depends on a font CDN:
 *  - Anton: the captions (tall condensed caps, the outrichguy look) and stamps
 *  - Inter (variable, 100-900): cards, screen inserts, in-world signs
 * `FAMILY` = bare family names for <canvas> text (3D textures); `fontsReady` resolves once both faces are loaded.
 */
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const anton = loadFont({ family: "CeoAnton", url: staticFile("assets/fonts/Anton-Regular.ttf"), weight: "400" });
const inter = loadFont({ family: "CeoInter", url: staticFile("assets/fonts/Inter-Variable.ttf"), weight: "100 900" });

export const FAMILY = { caption: "CeoAnton", title: "CeoInter", ui: "CeoInter" };

export const FONTS = {
  caption: `CeoAnton, Impact, "Arial Narrow", sans-serif`,
  title: `CeoInter, "Helvetica Neue", Arial, sans-serif`,
  ui: `CeoInter, system-ui, Arial, sans-serif`,
};

/** Resolves when both faces are ready (gates canvas-texture drawing). */
export const fontsReady: Promise<unknown> = Promise.all([anton, inter]).then(() => (typeof document !== "undefined" && document.fonts ? document.fonts.ready : undefined));
