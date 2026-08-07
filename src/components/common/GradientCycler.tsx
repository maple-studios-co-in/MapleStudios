/**
 * Auto-cycling reddish gradient — the 7 supplied shades (Default → Variant7)
 * crossfade sequentially on a 24.5s `.gradient-cycle` loop (3.5s per shade)
 * while each pans/zooms, so the light keeps travelling. Host element needs
 * `relative isolate` (the cycler sits at -z-10, below the host's content but
 * above its background). `fixed` renders viewport-locked for whole-page use.
 */
export default function GradientCycler({
  fixed = false,
  className = "",
}: {
  fixed?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${fixed ? "fixed" : "absolute"} inset-0 -z-10 overflow-hidden pointer-events-none ${className}`}
    >
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/figma/gradients/shade-${i}.webp`}
          alt=""
          className="gradient-cycle absolute inset-0 size-full object-cover"
          style={{ animationDelay: `${(i - 1) * 3.5}s` }}
        />
      ))}
    </div>
  );
}
