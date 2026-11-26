/** Niche registry: this package ships one niche. */
import { registerNiche } from "../core/registry";
import { ceoNiche } from "./ceo";

registerNiche(ceoNiche);
