import { useId } from 'react';
import type { PlayerSkinFinish } from '../game/types';

interface PlayerAvatarProps {
  color: string;
  accentColor?: string;
  finish?: PlayerSkinFinish;
  size?: number;
  showVisor?: boolean;
  className?: string;
}

export function PlayerAvatar({
  color,
  accentColor = '#F8FAFC',
  finish = 'solid',
  size = 24,
  showVisor = true,
  className = '',
}: PlayerAvatarProps) {
  const uid = useId().replace(/:/g, '_');
  const gradId = `av_grad_${uid}`;
  const patId = `av_pat_${uid}`;
  const clipId = `av_clip_${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="18" cy="18" r="15.5" />
        </clipPath>

        {finish === 'metal' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="28%" stopColor={accentColor} />
            <stop offset="52%" stopColor="#475569" />
            <stop offset="76%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
        ) : (
          <radialGradient id={gradId} cx="34%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="26%" stopColor={accentColor} />
            <stop offset="72%" stopColor={color} />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>
        )}

        {finish === 'fish_scale' && (
          <pattern id={patId} width="10" height="8" patternUnits="userSpaceOnUse">
            <path
              d="M0 4 Q5 9 10 4 M-5 0 Q0 5 5 0 M5 0 Q10 5 15 0"
              fill="none"
              stroke="rgba(255,255,255,0.42)"
              strokeWidth="1.2"
            />
            <path
              d="M0 8 Q5 13 10 8"
              fill="none"
              stroke="rgba(15,23,42,0.42)"
              strokeWidth="1.1"
            />
          </pattern>
        )}

        {finish === 'wood' && (
          <pattern id={patId} width="14" height="12" patternUnits="userSpaceOnUse">
            <rect width="14" height="12" fill="rgba(120,53,15,0.22)" />
            <path
              d="M0 3 Q7 1.5 14 3 M0 8 Q7 10 14 8"
              fill="none"
              stroke="rgba(253,224,71,0.24)"
              strokeWidth="1.1"
            />
            <path
              d="M0 5.5 Q7 4.2 14 5.5 M0 10.5 Q7 11.5 14 10.5"
              fill="none"
              stroke="rgba(28,10,2,0.55)"
              strokeWidth="1.2"
            />
          </pattern>
        )}

        {finish === 'metal' && (
          <pattern id={patId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="2" x2="12" y2="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
            <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(15,23,42,0.28)" strokeWidth="1" />
            <line x1="0" y1="10" x2="12" y2="10" stroke="rgba(241,245,249,0.25)" strokeWidth="1" />
          </pattern>
        )}
      </defs>

      <circle cx="18" cy="18" r="15.5" fill={`url(#${gradId})`} stroke="#090D16" strokeWidth="2.4" />

      {finish !== 'solid' && finish !== 'animated_sparkle' && (
        <circle cx="18" cy="18" r="15.5" fill={`url(#${patId})`} clipPath={`url(#${clipId})`} />
      )}

      {finish === 'animated_sparkle' && (
        <g clipPath={`url(#${clipId})`}>
          <path
            d="M9 6 L10.2 9.2 L13.4 10.4 L10.2 11.6 L9 14.8 L7.8 11.6 L4.6 10.4 L7.8 9.2 Z"
            fill="#FEF9C3"
            className="animate-pulse"
          />
          <path
            d="M25 11 L25.9 13.4 L28.3 14.3 L25.9 15.2 L25 17.6 L24.1 15.2 L21.7 14.3 L24.1 13.4 Z"
            fill="#FFFFFF"
          />
          <path
            d="M14 24 L14.8 26.2 L17 27 L14.8 27.8 L14 30 L13.2 27.8 L11 27 L13.2 26.2 Z"
            fill="#FEF08A"
          />
        </g>
      )}

      {showVisor && (
        <g>
          <ellipse cx="23.5" cy="18" rx="4.2" ry="7.4" fill="#090D16" />
          <circle cx="24.2" cy="15" r="1.8" fill={accentColor} />
          <circle cx="24.2" cy="21" r="1.8" fill={accentColor} />
          <circle cx="24.8" cy="14.5" r="0.7" fill="#FFFFFF" />
          <circle cx="24.8" cy="20.5" r="0.7" fill="#FFFFFF" />
        </g>
      )}
    </svg>
  );
}
