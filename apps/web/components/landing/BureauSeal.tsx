/**
 * The rotating bureau seal — circular engraved text around a sigma mark.
 * Pure SVG + CSS rotation (70s, paused under prefers-reduced-motion).
 */
export function BureauSeal({ size = 168, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={`seal-rotate select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 168 168" width={size} height={size} fill="none">
        <circle cx="84" cy="84" r="82" stroke="var(--color-brass)" strokeOpacity="0.45" />
        <circle cx="84" cy="84" r="58" stroke="var(--color-brass)" strokeOpacity="0.3" />
        {/* tick ring between the circles */}
        {Array.from({ length: 60 }).map((_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r1 = 58;
          const r2 = i % 5 === 0 ? 52 : 55;
          return (
            <line
              key={i}
              x1={84 + r1 * Math.cos(a)}
              y1={84 + r1 * Math.sin(a)}
              x2={84 + r2 * Math.cos(a)}
              y2={84 + r2 * Math.sin(a)}
              stroke="var(--color-brass)"
              strokeOpacity={i % 5 === 0 ? 0.55 : 0.25}
            />
          );
        })}
        <defs>
          <path id="seal-text-path" d="M 84,14 A 70,70 0 1 1 83.99,14" />
        </defs>
        <text
          fontSize="10.5"
          letterSpacing="3.2"
          fill="var(--color-brass)"
          fillOpacity="0.8"
          style={{ fontFamily: 'var(--font-monod)' }}
        >
          <textPath href="#seal-text-path">
            SIBYL BUREAU · RATED ON CALIBRATION · MANTLE · Nº 8004 ·
          </textPath>
        </text>
        <text
          x="84"
          y="99"
          textAnchor="middle"
          fontSize="46"
          fontStyle="italic"
          fill="var(--color-bureau-fg)"
          fillOpacity="0.9"
          style={{ fontFamily: 'var(--font-serifd)' }}
        >
          S
        </text>
      </svg>
    </div>
  );
}
