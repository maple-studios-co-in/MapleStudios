"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WebGL strip-displacement hover (the trionn.com lion interaction).
 *
 * WHY WEBGL: I inspected trionn.com/about directly — their lion is a
 * WebGL2 canvas (2048x1200, `touch-none`, "drag the strips"), not DOM
 * elements. The image is displaced PER ROW inside a fragment shader, which
 * is why it reads as one continuous piece of material tearing rather than
 * a stack of sliding boxes. A DOM version can't reach that: ~56 divs is
 * both too coarse to look continuous and too expensive to animate, and it
 * can only translate whole strips — no per-strip magnification, seam
 * shading or glow. So this samples the texture with a per-strip offset in
 * GLSL: hundreds of strips, all on the GPU, one draw call per frame.
 *
 * Motion: a spring integrator (position + velocity) eases the pointer
 * uniforms, so strips lag and overshoot slightly instead of snapping.
 * Per-frame JS work is a handful of uniform writes — no layout reads.
 *
 * Falls back to a plain <img> when WebGL2 is unavailable or the user
 * prefers reduced motion.
 */
const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
uniform vec2 u_rot;     // radians: x = pitch, y = yaw
uniform float u_aspect; // stage width / height
uniform float u_scale;

void main() {
  // flip Y so the texture renders upright
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);

  // rotate the image PLANE in real 3D, then let the rasteriser do the
  // perspective divide (w) — this is what makes the bird turn as you
  // scroll instead of just skewing. Scale x by aspect so the rotation is
  // square, and undo it before handing back NDC.
  vec3 p = vec3(a_pos.x * u_aspect, a_pos.y, 0.0) * u_scale;
  float cx = cos(u_rot.x), sx = sin(u_rot.x);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float cy = cos(u_rot.y), sy = sin(u_rot.y);
  p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);

  float focal = 3.2;
  float w = 1.0 + p.z / focal;
  gl_Position = vec4(p.x / u_aspect, p.y, 0.0, w);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;
uniform vec2  u_mouse;    // 0..1, y from top
uniform float u_active;   // 0..1 hover amount
uniform float u_time;
uniform float u_strips;
uniform float u_amp;      // max displacement, uv units
uniform float u_sigma;    // width of the torn band
uniform float u_glow;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  vec2 uv = v_uv;
  float N = u_strips;
  float idx = floor(uv.y * N);
  float band = (idx + 0.5) / N;
  float r = hash(idx);
  float r2 = hash(idx + 41.0);

  // how strongly this strip is caught by the cursor's row
  float d = (band - u_mouse.y) / u_sigma;
  float g = exp(-d * d);

  // cursor offset from centre drives direction; per-strip bias makes
  // neighbours travel at different speeds and even oppose each other
  float mx = (u_mouse.x - 0.5) * 2.0;
  float bias = mix(0.45, 1.0, r) * (r2 > 0.5 ? 1.0 : -0.7);
  float shift = u_amp * u_active * (mx * (0.28 + 0.72 * g) * bias + g * sign(mx) * 0.45 * (0.4 + r));

  // idle drift so the bird breathes before you touch it
  shift += 0.0016 * sin(u_time * 0.7 + idx * 0.6) * (1.0 - u_active);

  // strips near the cursor magnify slightly = they read as nearer
  float depth = 1.0 + 0.05 * g * u_active;
  float x = (uv.x - 0.5) / depth + 0.5 + shift;
  float y = uv.y + (r - 0.5) * 0.004 * g * u_active;

  vec4 c = texture(u_tex, vec2(x, y));
  if (x < 0.0 || x > 1.0 || y < 0.0 || y > 1.0) c = vec4(0.0);

  // shade the leading edge of each strip so the tear has thickness
  float f = fract(uv.y * N);
  float edge = smoothstep(0.0, 0.16, f) * smoothstep(1.0, 0.84, f);
  c.rgb *= mix(1.0, 0.86 + 0.14 * edge, g * u_active);

  // warm visor glow riding the cursor row
  float gl = exp(-pow((uv.y - u_mouse.y) / 0.055, 2.0)) * u_active * u_glow;
  c.rgb += gl * vec3(0.42, 0.16, 0.06) * c.a;

  outColor = c;
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("StripParallax shader:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function StripParallax({
  src,
  strips = 120,
  amp = 0.045,
  sigma = 0.13,
  glow = 0.9,
  rotScroll = 15,
  rotPointer = 7,
  className = "",
  ariaLabel,
}: {
  src: string;
  /** number of horizontal slices resolved in the shader */
  strips?: number;
  /** max horizontal displacement, in UV units (0.045 ~ 4.5% of width) */
  amp?: number;
  /** width of the torn band around the cursor, UV units */
  sigma?: number;
  /** warm glow intensity on the cursor row (0 disables) */
  glow?: number;
  /** degrees of 3D pitch across the element's full travel through the
      viewport — the "it turns as you scroll" behaviour */
  rotScroll?: number;
  /** extra degrees of pitch/yaw the pointer adds while hovering */
  rotPointer?: number;
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

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
    });
    if (!gl) {
      setFallback(true);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setFallback(true);
      return;
    }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("StripParallax link:", gl.getProgramInfoLog(prog));
      setFallback(true);
      return;
    }
    gl.useProgram(prog);

    // full-screen quad
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      // a real quad (2 triangles): the plane has to have actual corners so
      // it can be rotated in 3D — a full-screen triangle cannot
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {
      tex: gl.getUniformLocation(prog, "u_tex"),
      mouse: gl.getUniformLocation(prog, "u_mouse"),
      active: gl.getUniformLocation(prog, "u_active"),
      time: gl.getUniformLocation(prog, "u_time"),
      strips: gl.getUniformLocation(prog, "u_strips"),
      amp: gl.getUniformLocation(prog, "u_amp"),
      sigma: gl.getUniformLocation(prog, "u_sigma"),
      glow: gl.getUniformLocation(prog, "u_glow"),
      rot: gl.getUniformLocation(prog, "u_rot"),
      aspect: gl.getUniformLocation(prog, "u_aspect"),
      scale: gl.getUniformLocation(prog, "u_scale"),
    };
    gl.uniform1i(U.tex, 0);
    gl.uniform1f(U.strips, strips);
    gl.uniform1f(U.amp, amp);
    gl.uniform1f(U.sigma, sigma);
    gl.uniform1f(U.glow, glow);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // ——— render loop state ———
    // Declared BEFORE the texture/resize setup: both call wake() during
    // init, and while `wake` is a hoisted declaration, `s`/`draw`/`ready`
    // are not — reaching them early is a temporal-dead-zone crash.
    const s = {
      tx: 0.5, ty: 0.5, tAct: 0, tScroll: 0,
      x: 0.5, y: 0.5, act: 0, scroll: 0,
      vx: 0, vy: 0, va: 0, vs: 0,
      raf: 0, running: false, t0: performance.now(),
    };
    let ready = false;
    let aspect = 1;
    const RAD = Math.PI / 180;

    const draw = () => {
      const K = 0.06;
      const F = 0.82;
      s.vx += (s.tx - s.x) * K; s.vx *= F; s.x += s.vx;
      s.vy += (s.ty - s.y) * K; s.vy *= F; s.y += s.vy;
      s.va += (s.tAct - s.act) * K; s.va *= F; s.act += s.va;
      s.vs += (s.tScroll - s.scroll) * K; s.vs *= F; s.scroll += s.vs;

      const m = reduced ? 0 : 1;
      // pitch = scroll travel (+ a little from the pointer), yaw = pointer
      const rx = (s.scroll * rotScroll + (s.y - 0.5) * rotPointer * s.act) * RAD * m;
      const ry = (s.x - 0.5) * 2 * rotPointer * s.act * RAD * m;
      gl.uniform2f(U.rot, rx, ry);
      gl.uniform2f(U.mouse, s.x, s.y);
      gl.uniform1f(U.active, reduced ? 0 : s.act);
      gl.uniform1f(U.time, (performance.now() - s.t0) / 1000);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (ready) gl.drawArrays(gl.TRIANGLES, 0, 6);

      const settled =
        Math.abs(s.tx - s.x) < 0.0005 && Math.abs(s.vx) < 0.0005 &&
        Math.abs(s.ty - s.y) < 0.0005 && Math.abs(s.vy) < 0.0005 &&
        Math.abs(s.tAct - s.act) < 0.0005 && Math.abs(s.va) < 0.0005 &&
        Math.abs(s.tScroll - s.scroll) < 0.0005 && Math.abs(s.vs) < 0.0005;
      if (settled && s.act < 0.001) {
        s.running = false;
        return;
      }
      s.raf = requestAnimationFrame(draw);
    };
    function wake() {
      if (!s.running) {
        s.running = true;
        s.raf = requestAnimationFrame(draw);
      }
    }

    // texture (1x1 placeholder until the image decodes)
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      ready = true;
      canvas.dataset.ready = "1";
      wake();
    };
    img.src = src;

    // ——— sizing ———
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      aspect = r.height > 0 ? r.width / r.height : 1;
      gl.uniform1f(U.aspect, aspect);
      // shrink slightly so the rotated corners never clip the canvas edge
      gl.uniform1f(U.scale, 0.94);
      wake();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // scroll drives the 3D pitch: -1 when the element sits below the fold,
    // +1 once it has travelled above the viewport — geometry is read here,
    // never inside the rAF loop
    const onScroll = () => {
      const r = host.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const p = (window.innerHeight / 2 - center) / (window.innerHeight / 2 + r.height / 2);
      s.tScroll = Math.max(-1, Math.min(1, p));
      wake();
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect(); // read in the EVENT, not the loop
      s.tx = (e.clientX - r.left) / r.width;
      s.ty = (e.clientY - r.top) / r.height;
      s.tAct = 1;
      wake();
    };
    const onLeave = () => {
      s.tAct = 0;
      s.tx = 0.5;
      wake();
    };
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointercancel", onLeave);
    // debug hook — inspectable spring state, no behavioural effect
    (host as HTMLDivElement & { __sim?: typeof s }).__sim = s;

    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointercancel", onLeave);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      cancelAnimationFrame(s.raf);
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [src, strips, amp, sigma, glow, rotScroll, rotPointer]);

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
