"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The living about-page eagle: the DepthParallax engine (trionn.com's
 * depth-map displacement — head turns toward the cursor in 3D) extended
 * with three behaviours reverse-engineered from the Veo reference clip
 * (Eagle_blinking_and_breathing, 8s):
 *
 *  EYES  — the iris rolls toward the gaze target inside two analytic
 *          ellipse sockets (no mask texture; centers/radii measured off
 *          eagle-live.webp at 1024x1094: L(365,385) R(665,388) r 55x42).
 *          Gaze = the eased cursor, plus a decaying glance in the page's
 *          scroll direction, so scrolling makes it look up/down too.
 *  BLINK — lids wipe down by pulling samples toward the brow line inside
 *          the sockets; cadence from the clip (~120ms close, ~70ms hold,
 *          ~160ms open, every 2.6–5.2s, occasional double).
 *  BREATH— the whole head swells ~0.7% around a chest pivot on a 3.2s
 *          sine (the clip's visible chest cycle), independent of the
 *          slower trionn displacement drift.
 *
 * Portability guards carried over from DepthParallax: CPU-side time
 * (mediump-safe), UNPACK_FLIP_Y on upload, synchronous redraw on resize,
 * webglcontextlost -> <img> fallback, reduced-motion -> <img>.
 */

const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uImageScale;
uniform vec2 uMouseEase;
uniform float uAmount;
uniform float uHover;
uniform vec3 uBg;
uniform vec2 uGaze;    // -1..1, +x right, +y up
uniform float uBlink;  // 0 open .. 1 closed
uniform float uBreath; // -1..1 chest sine

// eye geometry in flipped-v UV space (v=0 bottom), measured on the asset
const vec2 EYE_L = vec2(0.3564, 0.6481);
const vec2 EYE_R = vec2(0.6494, 0.6453);
const vec2 EYE_RAD = vec2(0.0537, 0.0384);
// throat (gular) region below the beak tip, flipped-v UV
const vec2 THROAT_C = vec2(0.5, 0.36);
const vec2 THROAT_R = vec2(0.17, 0.12);

vec2 containUv(vec2 uv, vec2 viewport, vec2 image) {
  float vr = viewport.x / viewport.y;
  float ir = image.x / image.y;
  vec2 scale = vec2(1.0);
  if (vr > ir) scale.x = ir / vr; else scale.y = vr / ir;
  return (uv - 0.5) / scale + 0.5;
}

float socket(vec2 uv, vec2 c) {
  return 1.0 - smoothstep(0.55, 1.15, length((uv - c) / EYE_RAD));
}

void main() {
  vec2 contained = containUv(vUv, uResolution, uImageScale);
  // breathing: the THROAT patch right below the beak inflates and
  // deflates (the clip's gular pumping) — a local magnification inside a
  // soft ellipse under the beak tip; eyes and ruff sides stay put. The
  // throat is near-uniform white fluff, so the warp alone is invisible —
  // uThroatShade below adds the light-catching sheen that makes the
  // swell READ.
  float breath01 = uBreath * 0.5 + 0.5;
  float tm = 1.0 - smoothstep(0.30, 1.0, length((contained - THROAT_C) / THROAT_R));
  // pouch filling = TRANSLATION, not magnification: pure local zoom moves
  // pixels ~2px at any sane amplitude (displacement = r*amp*mask) and
  // reads as static. The chin content drops (~2% UV = 15px) and widens as
  // the pouch fills — that silhouette shift is the visible breath.
  contained = THROAT_C + (contained - THROAT_C) / (1.0 + 0.20 * breath01 * tm);
  contained.y += 0.040 * breath01 * tm;
  bool outside = contained.x < 0.0 || contained.x > 1.0 || contained.y < 0.0 || contained.y > 1.0;
  if (outside) { gl_FragColor = vec4(uBg, 1.0); return; }

  vec2 mouse = (uMouseEase - 0.5) * vec2(2.0, -2.0);
  float depth = texture2D(uDepth, contained).r;
  vec2 disp = mouse * depth * (uAmount * uHover);
  vec2 uv = contained - disp;

  // iris rolls toward the gaze inside each socket
  float m = max(socket(uv, EYE_L), socket(uv, EYE_R));
  uv -= uGaze * EYE_RAD * 0.55 * m;

  // blink: pull samples up to the brow line so the lid wipes the socket
  float lidV = EYE_L.y + EYE_RAD.y * 1.05;
  uv.y = mix(uv.y, lidV, uBlink * m);

  float r = texture2D(uImage, uv + disp * 0.16).r;
  float g = texture2D(uImage, uv).g;
  float b = texture2D(uImage, uv - disp * 0.16).b;
  float a = texture2D(uImage, uv).a;
  vec3 color = vec3(r, g, b);
  // soft lid shadow while closing
  color *= 1.0 - 0.12 * uBlink * m;
  // swelling throat catches the light — the visible half of the breath
  color *= 1.0 + 0.08 * breath01 * tm;
  gl_FragColor = vec4(mix(uBg, color, a), 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export default function EagleLive({
  src,
  depthSrc,
  bg = "#fff3d3",
  strength = 1,
  className = "",
  ariaLabel,
}: {
  src: string;
  depthSrc: string;
  bg?: string;
  strength?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFallback(true);
      return;
    }
    const mobile = window.innerWidth <= 768;
    const gl = canvas.getContext("webgl", {
      antialias: !mobile,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    let dead = false;
    let texImage: WebGLTexture | null = null;
    let texDepth: WebGLTexture | null = null;
    const compile = (type: number, source: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("EagleLive shader:", gl.getShaderInfoLog(sh));
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFallback(true);
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("EagleLive link:", gl.getProgramInfoLog(prog));
      setFallback(true);
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(prog, "aPosition");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {
      resolution: gl.getUniformLocation(prog, "uResolution"),
      image: gl.getUniformLocation(prog, "uImage"),
      depth: gl.getUniformLocation(prog, "uDepth"),
      imageScale: gl.getUniformLocation(prog, "uImageScale"),
      mouseEase: gl.getUniformLocation(prog, "uMouseEase"),
      amount: gl.getUniformLocation(prog, "uAmount"),
      hover: gl.getUniformLocation(prog, "uHover"),
      bg: gl.getUniformLocation(prog, "uBg"),
      gaze: gl.getUniformLocation(prog, "uGaze"),
      blink: gl.getUniformLocation(prog, "uBlink"),
      breath: gl.getUniformLocation(prog, "uBreath"),
    };
    gl.uniform3f(U.bg, ...hexToRgb(bg));

    const st = {
      mouse: { x: 0.5, y: 0.5 },
      eased: { x: 0.5, y: 0.5 },
      hover: 1,
      // blink machine
      blink: 0,
      blinkAt: performance.now() + 1800 + Math.random() * 2400,
      // scroll glance
      scrollBias: 0,
      scrollTarget: 0,
      lastScrollY: window.scrollY,
    };
    let ready = false;
    let raf = 0;
    let running = false;
    let visible = true;

    const makeTexture = (image: TexImageSource) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return t;
    };
    const load = (url: string) =>
      new Promise<HTMLImageElement>((res, rej) => {
        const im = new Image();
        im.onload = () => (im.decode ? im.decode().then(() => res(im)).catch(() => res(im)) : res(im));
        im.onerror = rej;
        im.src = url;
      });

    // blink envelope: 120ms close, 70ms hold, 160ms open (from the clip)
    const blinkValue = (now: number) => {
      const t = now - st.blinkAt;
      if (t < 0) return 0;
      if (t < 120) return t / 120;
      if (t < 190) return 1;
      if (t < 350) return 1 - (t - 190) / 160;
      // schedule the next one; 12% chance of a quick double-blink
      st.blinkAt = now + (Math.random() < 0.12 ? 420 : 2600 + Math.random() * 2600);
      return 0;
    };

    // shaped breath cycle (not a bare sine): a distinct inhale, a short
    // hold, a slower exhale, then rest — one visible breath every ~3.4s,
    // periodic and deliberate the way the blink is
    const easeInOut = (t: number) => t * t * (3 - 2 * t);
    const breathEnvelope = (now: number) => {
      const ph = (now % 3400) / 3400;
      if (ph < 0.32) return easeInOut(ph / 0.32); // inhale
      if (ph < 0.45) return 1; // hold
      if (ph < 0.85) return 1 - easeInOut((ph - 0.45) / 0.4); // exhale
      return 0; // rest
    };
    const drawNow = (now: number) => {
      const breathing = Math.sin(now * 0.0012) * 0.5 + 0.5; // trionn drift
      st.blink = blinkValue(now);
      st.scrollTarget *= 0.9; // glance decays once scrolling stops
      st.scrollBias += (st.scrollTarget - st.scrollBias) * 0.12;
      const gx = Math.max(-1, Math.min(1, (st.eased.x - 0.5) * 2));
      const gy = Math.max(-1, Math.min(1, (0.5 - st.eased.y) * 2 + st.scrollBias));
      gl.uniform2f(U.resolution, canvas.width, canvas.height);
      gl.uniform2f(U.mouseEase, st.eased.x, st.eased.y);
      gl.uniform1f(U.amount, (0.03 + 0.012 * breathing) * strength);
      gl.uniform1f(U.hover, st.hover);
      gl.uniform2f(U.gaze, gx, gy);
      gl.uniform1f(U.blink, st.blink);
      gl.uniform1f(U.breath, breathEnvelope(now) * 2 - 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const frame = (now: number) => {
      st.eased.x += (st.mouse.x - st.eased.x) * 0.07;
      st.eased.y += (st.mouse.y - st.eased.y) * 0.07;
      drawNow(now);
      raf = requestAnimationFrame(frame);
    };
    const setRunning = (on: boolean) => {
      if (on && !running && ready) {
        running = true;
        raf = requestAnimationFrame(frame);
      } else if (!on && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        if (ready) drawNow(performance.now());
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const point = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      st.mouse.x = Math.max(0, Math.min(1, (cx - r.left) / r.width));
      st.mouse.y = Math.max(0, Math.min(1, (cy - r.top) / r.height));
      st.hover = 1;
    };
    const onMove = (e: MouseEvent) => point(e.clientX, e.clientY);
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length) point(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget === null) {
        st.mouse.x = 0.5;
        st.mouse.y = 0.5;
      }
    };
    // scroll direction -> a decaying glance (also covers touch scrolling)
    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - st.lastScrollY;
      st.lastScrollY = y;
      st.scrollTarget = Math.max(-1, Math.min(1, st.scrollTarget - delta / 260));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("pointerout", onOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    const onLost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        setRunning(visible);
      },
      { threshold: 0, rootMargin: "64px 0px" }
    );
    io.observe(host);

    Promise.all([load(src), load(depthSrc)])
      .then(([img, dep]) => {
        if (dead) return;
        texImage = makeTexture(img);
        texDepth = makeTexture(dep);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texImage);
        gl.uniform1i(U.image, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texDepth);
        gl.uniform1i(U.depth, 1);
        gl.uniform2f(U.imageScale, img.naturalWidth, img.naturalHeight);
        ready = true;
        canvas.dataset.ready = "1";
        setRunning(visible);
      })
      .catch(() => setFallback(true));

    // debug hook — inspectable state, no behavioural effect
    (host as HTMLDivElement & { __eagle?: typeof st }).__eagle = st;

    return () => {
      dead = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("scroll", onScroll);
      ro.disconnect();
      io.disconnect();
      cancelAnimationFrame(raf);
      if (texImage) gl.deleteTexture(texImage);
      if (texDepth) gl.deleteTexture(texDepth);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [src, depthSrc, bg, strength]);

  return (
    <div
      ref={hostRef}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      className={`relative [touch-action:pan-y] ${className}`}
    >
      {fallback ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-contain" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      )}
    </div>
  );
}
