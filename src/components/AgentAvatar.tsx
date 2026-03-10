import { useMemo } from 'react';
import type { Agent } from '../types';

const assetBase = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

/** Map agent IDs to sprite numbers (stable order, same as OfficeView) */
export function buildSpriteMap(agents: Agent[]): Map<string, number> {
  const map = new Map<string, number>();
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((a, i) => map.set(a.id, (i % 12) + 1));
  return map;
}

/** Hook: memoized sprite map from agents array */
export function useSpriteMap(agents: Agent[]): Map<string, number> {
  return useMemo(() => buildSpriteMap(agents), [agents]);
}

/** Get the sprite number for an agent by ID */
export function getSpriteNum(agents: Agent[], agentId: string): number | undefined {
  const sorted = [...agents].sort((a, b) => a.id.localeCompare(b.id));
  const idx = sorted.findIndex((a) => a.id === agentId);
  return idx >= 0 ? (idx % 12) + 1 : undefined;
}

interface AgentAvatarProps {
  agent: Agent | undefined;
  agents?: Agent[];
  spriteMap?: Map<string, number>;
  size?: number;
  className?: string;
  rounded?: 'full' | 'xl' | '2xl';
}

/** Sprite-based avatar — pass either `agents` or `spriteMap` */
export default function AgentAvatar({
  agent,
  agents,
  spriteMap,
  size = 28,
  className = '',
  rounded = 'full',
}: AgentAvatarProps) {
  const map = spriteMap ?? (agents ? buildSpriteMap(agents) : new Map());
  const spriteNum = agent ? map.get(agent.id) : undefined;
  const imageLoading = size <= 48 ? 'lazy' : 'eager';

  const roundedClass = rounded === 'full' ? 'rounded-full' : rounded === 'xl' ? 'rounded-xl' : 'rounded-2xl';

  if (spriteNum) {
    return (
      <div
        className={`${roundedClass} overflow-hidden bg-gray-700 flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={`${assetBase}/sprites/${spriteNum}-D-1.png`}
          alt={agent?.name ?? ''}
          width={size}
          height={size}
          loading={imageLoading}
          decoding="async"
          draggable={false}
          className="w-full h-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
    );
  }
  return (
    <div
      className={`${roundedClass} bg-gray-700 flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.6 }}
    >
      {agent?.avatar_emoji ?? '🤖'}
    </div>
  );
}
