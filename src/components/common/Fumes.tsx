"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Smoke rising from the bottom of the contact form's dark block.
 *
 * Modelled on trionn's `form-background-video.mp4`, measured frame by frame
 * rather than guessed at. What that plate actually does:
 *
 *   • Density is BOTTOM-HEAVY, ~4:1. Mean luminance over the plate runs
 *     ~69 across the bottom fifth, ~40 through the middle, ~17 across the top
 *     fifth. This gradient — not bulk motion — is what makes it read as
 *     "fumes coming off the bottom of the section".
 *   • It barely translates (measured ~5-10 px/s on a 450px plate) and never
 *     blows out (peak luminance ~131/255). It BILLOWS: the field deforms in
 *     place far more than it travels.
 *   • Brightest around bottom-centre, falling off toward both side edges.
 *
 * So this is a plume model, not a scrolling texture: an emission envelope
 * that decays exponentially with height, a slow rise, and a domain warp whose
 * strength GROWS with height so the plume shears and spreads as it climbs —
 * which is what gives the billowing its direction.
 *
 * Rendered rather than shipped as footage: no bytes to download, it never
 * visibly loops (their 10s plate does), and it fits any viewport without
 * stretching. One GPU draw per frame of a small buffer, parked by
 * IntersectionObserver when off screen, one static frame under reduced motion.
 */
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
// highp is LOAD-BEARING: hash() runs fract(sin(x) * 43758.5) on coordinates
// that reach ~50 by the last octave. In mediump that product loses its whole
// mantissa, the noise collapses to a constant, and the quad renders SOLID
// WHITE over the form.
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uAspect;
uniform float uIntensity;
uniform vec3 uColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// rotated octaves so the layers never line up into a visible grid
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  float up = vUv.y;              // 0 at the bottom of the block, 1 at the top
  vec2 uv = vUv * uAspect;

  // A plume EXPANDS as it climbs: sampling at a larger scale higher up makes
  // features grow, so wisps broaden and soften on the way rather than
  // marching up at a fixed size.
  vec2 p = uv * 3.1 / (1.0 + up * 0.95);

  // slow rise — the reference barely translates, so this stays gentle
  p.y -= uTime * 0.055;

  // Domain warp (fbm of fbm) = billowing. Its strength grows with height, so
  // the plume shears and frays upward instead of deforming uniformly.
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(
    fbm(p + 1.4 * q + vec2(1.7, 9.2) + uTime * 0.013),
    fbm(p + 1.4 * q + vec2(8.3, 2.8) - uTime * 0.011)
  );
  float f = fbm(p + (0.85 + up * 1.5) * r);

  // Haze, not hard-edged smoke: a wide ramp keeps the midtones the reference
  // is mostly made of.
  float d = smoothstep(0.28, 0.86, f);

  // Emission envelope. exp(-1.9 * up) reproduces the measured ~4:1 bottom-to-
  // top ratio; the last few percent fade so the layer cannot stamp a hard
  // line where the dark block ends.
  float plume = exp(-1.9 * up) * smoothstep(0.0, 0.05, up);

  // brightest around bottom-centre, thinning toward the side edges
  float centre = mix(1.0, 0.45, smoothstep(0.0, 0.85, abs(vUv.x - 0.5) * 2.0));

  // clamped: no combination of inputs may ever wash the section out
  float a = clamp(d * plume * centre * uIntensity, 0.0, 0.5);
  gl_FragColor = vec4(uColor, a);
}
`;

/** Offscreen buffer size relative to CSS pixels — the main perf lever. */
const RES_SCALE = 0.55;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/** Module-level so the default is a STABLE reference (see the deps note in
    the effect below — an inline default array here would re-init WebGL on
    every parent render). */
const DEFAULT_COLOR: readonly [number, number, number] = [1.0, 0.97, 0.93];

export default function Fumes({
  className = "",
  /** peak alpha of the plume */
  intensity = 0.68,
  /** warm white — reads as lit vapour over the maroon ground */
  color = DEFAULT_COLOR,
}: {
  className?: string;
  intensity?: number;
  color?: readonly [number, number, number];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** bumped on webglcontextrestored to re-run setup */
  const [gen, setGen] = useState(0);
  // Depend on PRIMITIVES, never on the array itself. The parent re-renders on
  // every keystroke in the form; with an array in the deps this effect tore
  // down and rebuilt the context each time, and its cleanup called
  // loseContext() — after one character the context was dead and the canvas
  // painted solid white over the whole section.
  const [cr, cg, cb] = color;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    // straight (non-premultiplied) alpha: the shader writes a colour with a
    // separate alpha, which is not a valid premultiplied pair
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // no WebGL — the section simply renders without smoke

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uAspect = gl.getUniformLocation(prog, "uAspect");
    gl.uniform1f(gl.getUniformLocation(prog, "uIntensity"), intensity);
    gl.uniform3f(gl.getUniformLocation(prog, "uColor"), cr, cg, cb);

    let raf = 0;
    let running = false;

    // A lost context is recoverable only if the default is prevented; without
    // this the browser never fires webglcontextrestored and the canvas stays
    // dead (and, on some drivers, opaque white).
    const onLost = (e: Event) => {
      e.preventDefault();
      running = false;
      cancelAnimationFrame(raf);
    };
    const onRestored = () => setGen((g) => g + 1);
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const teardownListeners = () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const resize = () => {
      const r = host.getBoundingClientRect();
      const nw = Math.max(1, Math.round(r.width * RES_SCALE));
      const nh = Math.max(1, Math.round(r.height * RES_SCALE));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      // keep the noise isotropic whatever the block's proportions
      const a = r.width / Math.max(1, r.height);
      gl.uniform2f(uAspect, a > 1 ? a : 1, a > 1 ? 1 : 1 / a);
    };
    resize();

    const start = performance.now();
    const draw = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (now: number) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw(performance.now());
    });
    ro.observe(host);

    if (reduced) {
      draw(start + 9000); // one settled frame, no animation
      return () => {
        ro.disconnect();
        teardownListeners();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    }

    // only burn frames while the block is actually on screen
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !running) {
          running = true;
          raf = requestAnimationFrame(loop);
        } else if (!e.isIntersecting && running) {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { rootMargin: "15% 0px" }
    );
    io.observe(host);

    return () => {
      io.disconnect();
      ro.disconnect();
      teardownListeners();
      running = false;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // PRIMITIVES ONLY — see the note above `cr`. `gen` re-runs setup after a
    // context restore.
  }, [intensity, cr, cg, cb, gen]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
    >
      <canvas
        ref={canvasRef}
        // drawn at RES_SCALE and stretched back up; a light blur hides the
        // upscale without erasing the fine filaments
        className="size-full"
        style={{ filter: "blur(4px)" }}
      />
    </div>
  );
}
