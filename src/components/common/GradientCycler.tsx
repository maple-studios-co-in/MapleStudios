/**
 * Auto-cycling reddish gradient (the four "Maple Studio Gradient" variants).
 * Each webp crossfades in for a quarter of the 28s `.gradient-cycle` loop, so
 * the light keeps moving — drop this inside any section that used the static
 * radial. Host element needs `isolate` (the cycler sits at -z-10, below the
 * host's content but above its background).
 *
 * `fixed` renders viewport-locked (equivalent of background-attachment: fixed)
 * for whole-page use like /work.
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
      {[1, 2, 3, 4].map((i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/figma/gradients/gradient-${i}.webp`}
          alt=""
          className="gradient-cycle absolute inset-0 size-full object-cover"
          style={{
            animationDelay: `${(i - 1) * 4}s`,
            // slight per-variant exposure difference makes each shade read distinct
            filter: `brightness(${1 + ((i - 1) % 2) * 0.12}) saturate(${1 + (i % 2) * 0.08})`,
          }}
        />
      ))}
    </div>
  );
}
