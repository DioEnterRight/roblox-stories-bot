import type { NicheModule } from "./types";

const registry = new Map<string, NicheModule>();

export const registerNiche = (mod: NicheModule) => {
  registry.set(mod.id, mod);
  mod.loadFonts?.();
  return mod;
};

export const getNiche = (id: string): NicheModule => {
  const m = registry.get(id);
  if (!m) throw new Error(`Niche "${id}" is not registered. Known: ${[...registry.keys()].join(", ") || "(none)"}. Import it in src/niches/index.ts.`);
  return m;
};

export const listNiches = () => [...registry.values()];
