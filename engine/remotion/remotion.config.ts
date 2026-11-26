/**
 * Remotion config for the studio (`npx remotion studio`). The pipeline renders through engine/scripts/render.mjs,
 * which passes its own options (software WebGL "swangle" + the runner's Chrome on GitHub).
 */
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
Config.setChromiumOpenGlRenderer("swangle");
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setPublicDir("public");
