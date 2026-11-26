/**
 * Post stack (style-bible §Post): depth of field (close-ups only), bloom on emissives, then ONE custom grade pass:
 * radial chromatic aberration (0 at centre → caPx at the corners), Khronos-neutral tone mapping with exposure,
 * saturation/contrast, split toning (teal shadows / warm highlights), vignette and frame-seeded grain.
 * All effects are created ONCE and mutated per frame (props-driven wrappers would rebuild the passes every frame).
 * mergeMode "none": each effect gets its own pass. With the default auto-merge, DOF + bloom + grade shared one EffectPass
 * and the grade (vignette/CA/tone map) vanished whenever DOF was active (bokeh > 0) — verified A/B on f366.
 * Grain is seeded by the Remotion frame, never by the clock → bit-reproducible.
 */
import React, { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { EffectComposer } from "@react-three/postprocessing";
import { BloomEffect, DepthOfFieldEffect, Effect, EffectAttribute } from "postprocessing";

const gradeFrag = /* glsl */ `
uniform float uSeed;
uniform float uVignette;
uniform float uVigRadius;
uniform float uCA;
uniform float uGrain;
uniform float uExposure;
uniform float uSat;
uniform float uContrast;
uniform float uSplit;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform vec3 uVigColor;

float h12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 neutralTM(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 toLinear(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 d = uv - 0.5;
  vec2 da = d * vec2(aspect, 1.0);
  float r = length(da) / length(vec2(aspect, 1.0) * 0.5);   // 0 centre → 1 corner
  vec2 off = normalize(d + 1e-6) * uCA * r * r * texelSize;
  vec3 col;
  col.r = texture2D(inputBuffer, uv + off).r;
  col.g = inputColor.g;
  col.b = texture2D(inputBuffer, uv - off).b;
  col = neutralTM(col * uExposure);
  vec3 s = toSRGB(col);
  float l = dot(s, vec3(0.299, 0.587, 0.114));
  s = mix(vec3(l), s, uSat);
  s = (s - 0.5) * uContrast + 0.5;
  float lum = clamp(dot(s, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  s += uShadowTint * (1.0 - smoothstep(0.0, 0.55, lum)) * uSplit;
  s += uHighTint * smoothstep(0.45, 1.0, lum) * uSplit;
  // corner-weighted vignette: square-normalised radius (corners 1.0, edge centres 0.71)
  float rq = length(d) / 0.7071;
  float v = smoothstep(uVigRadius, 1.06, rq);
  v = v * v * (3.0 - 2.0 * v);
  s = mix(s, s * uVigColor, v * uVignette);
  float n = h12(uv * resolution + vec2(uSeed * 37.0, uSeed * 91.0)) + h12(uv * resolution * 1.7 + uSeed * 13.0) - 1.0;
  s += n * uGrain * (0.6 + 0.4 * (1.0 - lum));
  outputColor = vec4(toLinear(s), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  constructor() {
    super("CeoGrade", gradeFrag, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ["uSeed", new THREE.Uniform(0)],
        ["uVignette", new THREE.Uniform(0.55)],
        ["uVigRadius", new THREE.Uniform(0.35)],
        ["uCA", new THREE.Uniform(4)],
        ["uGrain", new THREE.Uniform(0.012)],
        ["uExposure", new THREE.Uniform(1)],
        ["uSat", new THREE.Uniform(1.08)],
        ["uContrast", new THREE.Uniform(1.06)],
        ["uSplit", new THREE.Uniform(0.035)],
        ["uShadowTint", new THREE.Uniform(new THREE.Vector3(-0.35, 0.1, 0.45))],
        ["uHighTint", new THREE.Uniform(new THREE.Vector3(0.4, 0.12, -0.3))],
        ["uVigColor", new THREE.Uniform(new THREE.Vector3(0.04, 0.05, 0.075))],
      ]),
    });
  }
}

export type PostParams = {
  frame: number;
  exposure: number;
  vignette: number;
  vignetteRadius: number;
  ca: number;
  grain: number;
  sat: number;
  contrast: number;
  split: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  dof: { focus: number; range: number; bokeh: number } | null;
};

const setU = (e: Effect, name: string, v: number) => {
  const u = e.uniforms.get(name);
  if (u) u.value = v;
};

export const Post: React.FC<{ p: PostParams }> = ({ p }) => {
  const camera = useThree((s) => s.camera);
  const fx = useMemo(() => {
    const dof = new DepthOfFieldEffect(camera, { focusDistance: 6, focusRange: 3, bokehScale: 0, resolutionScale: 0.5 });
    const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.9, luminanceThreshold: 0.92, luminanceSmoothing: 0.12, radius: 0.72 });
    const grade = new GradeEffect();
    return { dof, bloom, grade };
  }, [camera]);
  // per-frame (deterministic) parameters
  fx.dof.cocMaterial.focusDistance = p.dof?.focus ?? 6;
  fx.dof.cocMaterial.focusRange = p.dof?.range ?? 100;
  fx.dof.bokehScale = p.dof ? p.dof.bokeh : 0;
  fx.bloom.intensity = p.bloom;
  fx.bloom.luminanceMaterial.threshold = p.bloomThreshold;
  const mip = (fx.bloom as unknown as { mipmapBlurPass?: { radius: number } }).mipmapBlurPass;
  if (mip) mip.radius = p.bloomRadius;
  setU(fx.grade, "uSeed", (p.frame % 997) + 1);
  setU(fx.grade, "uExposure", p.exposure);
  setU(fx.grade, "uVignette", p.vignette);
  setU(fx.grade, "uVigRadius", p.vignetteRadius);
  setU(fx.grade, "uCA", p.ca);
  setU(fx.grade, "uGrain", p.grain);
  setU(fx.grade, "uSat", p.sat);
  setU(fx.grade, "uContrast", p.contrast);
  setU(fx.grade, "uSplit", p.split);
  return (
    <EffectComposer multisampling={4} mergeMode="none">
      <primitive object={fx.dof} />
      <primitive object={fx.bloom} />
      <primitive object={fx.grade} />
    </EffectComposer>
  );
};
