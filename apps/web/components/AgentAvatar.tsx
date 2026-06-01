import { avatarGradient, agentInitials } from '../lib/utils';

export function AgentAvatar({ id, size = 38, ring }: { id: string; size?: number; ring?: string }) {
  return (
    <div
      className="grid place-items-center rounded-xl font-display font-bold text-ink shrink-0"
      style={{
        width: size,
        height: size,
        background: avatarGradient(id),
        fontSize: size * 0.36,
        boxShadow: ring ? `0 0 0 2px ${ring}, 0 6px 20px -8px rgba(0,0,0,0.6)` : '0 6px 20px -8px rgba(0,0,0,0.6)'
      }}
      title={id}
    >
      {agentInitials(id)}
    </div>
  );
}
