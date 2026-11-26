import React, { useLayoutEffect } from "react";
import { ThreeCanvas } from "@remotion/three";
import type { ThreeCanvasProps } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useCurrentFrame, useDelayRender, useRemotionEnvironment } from "remotion";

/**
 * FrameReady — guarantees every rendered frame is captured AFTER the whole Three scene
 * has committed and rendered (twice: shadow maps / postprocessing warm-up).
 * Fixes the black first frame(s) of <ThreeCanvas/>: Remotion only waits for R3F from frame 1 on,
 * and its creation-time advance() runs before the scene children exist.
 * Must be the LAST child inside the canvas.
 */
export const FrameReady: React.FC = () => {
  const frame = useCurrentFrame();
  const { delayRender, continueRender } = useDelayRender();
  const { advance, gl } = useThree();
  const { isRendering } = useRemotionEnvironment();
  useLayoutEffect(() => {
    if (!isRendering) return;
    const handle = delayRender(`Three scene ready for frame ${frame}`);
    let cancelled = false;
    const t1 = setTimeout(() => {
      if (cancelled) return;
      advance(performance.now());
      const t2 = setTimeout(() => {
        if (cancelled) return;
        advance(performance.now());
        const t3 = setTimeout(() => {
          if (cancelled) return;
          advance(performance.now());
          try { gl.getContext().finish(); } catch { /* context lost: let Remotion retry */ }
          continueRender(handle);
        }, 0);
        timers.push(t3);
      }, 0);
      timers.push(t2);
    }, 0);
    const timers: ReturnType<typeof setTimeout>[] = [t1];
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      continueRender(handle);
    };
  }, [frame, isRendering, advance, gl, delayRender, continueRender]);
  return null;
};

/** ThreeCanvas with the engine defaults (shadows, antialias) and the FrameReady gate. */
export const Canvas3D: React.FC<ThreeCanvasProps> = ({ children, ...props }) => (
  <ThreeCanvas shadows gl={{ antialias: true, powerPreference: "high-performance" }} {...props}>
    {children}
    <FrameReady />
  </ThreeCanvas>
);
