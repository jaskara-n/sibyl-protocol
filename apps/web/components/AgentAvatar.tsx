import { agentInitials } from '../lib/utils';

/**
 * Bureau monogram — a square, hairline-framed initials plate. `ring`, when
 * provided, tints the hairline border (a calibration-rating cue); otherwise it
 * falls back to the standard bureau hairline.
 */
export function AgentAvatar({ id, size = 38, ring }: { id: string; size?: number; ring?: string }) {
  return (
    <div
      className="grid shrink-0 place-items-center bg-bureau-panel font-serifd text-bureau-fg"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        border: `1px solid ${ring ?? 'var(--color-bureau-line)'}`
      }}
      title={id}
    >
      {agentInitials(id)}
    </div>
  );
}
