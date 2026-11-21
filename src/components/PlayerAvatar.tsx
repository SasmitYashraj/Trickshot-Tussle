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

  const needsPat = finish === 'fish_scale' || finish === 'wood' || finish === 'metal' || finish === 'carbon_fiber';

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

        {finish === 'metal' || finish === 'damascus' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="28%" stopColor={accentColor} />
            <stop offset="52%" stopColor="#475569" />
            <stop offset="76%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#1E293B" />
          </linearGradient>
        ) : finish === 'matte' ? (
          <radialGradient id={gradId} cx="36%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#373947" />
            <stop offset="48%" stopColor={color} />
            <stop offset="100%" stopColor="#090A0F" />
          </radialGradient>
        ) : finish === 'magma' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1C1917" />
            <stop offset="40%" stopColor="#7F1D1D" />
            <stop offset="76%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#FDBA74" />
          </linearGradient>
        ) : finish === 'synthwave' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EC4899" />
            <stop offset="50%" stopColor="#7E22CE" />
            <stop offset="100%" stopColor="#22D3EE" />
          </linearGradient>
        ) : finish === 'toxic_slime' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D9F99D" />
            <stop offset="36%" stopColor="#84CC16" />
            <stop offset="78%" stopColor="#15803D" />
            <stop offset="100%" stopColor="#052E16" />
          </linearGradient>
        ) : finish === 'frosted_ice' ? (
          <radialGradient id={gradId} cx="34%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="32%" stopColor="#E0F2FE" />
            <stop offset="72%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#075985" />
          </radialGradient>
        ) : finish === 'oil_slick' ? (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="35%" stopColor="#6366F1" />
            <stop offset="70%" stopColor="#C026D3" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
        ) : finish === 'plasma_core' ? (
          <radialGradient id={gradId} cx="46%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="28%" stopColor="#E879F9" />
            <stop offset="65%" stopColor="#3B0764" />
            <stop offset="100%" stopColor="#090514" />
          </radialGradient>
        ) : finish === 'galaxy' ? (
          <radialGradient id={gradId} cx="34%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#4338CA" />
            <stop offset="52%" stopColor="#1E1B4B" />
            <stop offset="100%" stopColor="#020617" />
          </radialGradient>
        ) : finish === 'amber_fossil' ? (
          <radialGradient id={gradId} cx="34%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="38%" stopColor="#F59E0B" />
            <stop offset="78%" stopColor="#B45309" />
            <stop offset="100%" stopColor="#451A03" />
          </radialGradient>
        ) : finish === 'hologram' ? (
          <radialGradient id={gradId} cx="36%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#67E8F9" />
            <stop offset="60%" stopColor="#0891B2" />
            <stop offset="100%" stopColor="#164E63" />
          </radialGradient>
        ) : finish === 'kintsugi' ? (
          <radialGradient id={gradId} cx="34%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="48%" stopColor="#F5F5F4" />
            <stop offset="84%" stopColor="#D6D3D1" />
            <stop offset="100%" stopColor="#78716C" />
          </radialGradient>
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
              fill="rgba(255,255,255,0.12)"
              stroke="rgba(255,255,255,0.46)"
              strokeWidth="1.2"
            />
            <path
              d="M0 8 Q5 13 10 8"
              fill="none"
              stroke="rgba(15,23,42,0.48)"
              strokeWidth="1.15"
            />
          </pattern>
        )}

        {finish === 'wood' && (
          <pattern id={patId} width="14" height="12" patternUnits="userSpaceOnUse">
            <rect width="14" height="12" fill="rgba(110,48,14,0.28)" />
            <path
              d="M0 3 Q7 1.5 14 3 M0 8 Q7 10 14 8"
              fill="none"
              stroke="rgba(253,224,71,0.26)"
              strokeWidth="1.1"
            />
            <path
              d="M0 5.5 Q7 4.2 14 5.5 M0 10.5 Q7 11.5 14 10.5"
              fill="none"
              stroke="rgba(24,8,2,0.62)"
              strokeWidth="1.3"
            />
          </pattern>
        )}

        {finish === 'metal' && (
          <pattern id={patId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="2" x2="12" y2="2" stroke="rgba(255,255,255,0.48)" strokeWidth="1.3" />
            <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(15,23,42,0.32)" strokeWidth="1" />
            <line x1="0" y1="10" x2="12" y2="10" stroke="rgba(241,245,249,0.28)" strokeWidth="1" />
          </pattern>
        )}

        {finish === 'carbon_fiber' && (
          <pattern id={patId} width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#14161B" />
            <rect x="0" y="0" width="3" height="2.4" fill="#4B5563" />
            <rect x="3" y="3" width="3" height="2.4" fill="#3F3F46" />
            <rect x="0" y="0" width="3" height="0.7" fill="rgba(255,255,255,0.18)" />
          </pattern>
        )}
      </defs>

      <circle cx="18" cy="18" r="15.5" fill={`url(#${gradId})`} stroke="rgba(8, 12, 22, 0.38)" strokeWidth="0.95" />

      {needsPat && <circle cx="18" cy="18" r="15.5" fill={`url(#${patId})`} clipPath={`url(#${clipId})`} />}

      {finish === 'billiard_stripe' && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="36" height="10.5" fill="#F8FAFC" opacity="0.92" />
          <rect x="0" y="25.5" width="36" height="10.5" fill="#F8FAFC" opacity="0.92" />
        </g>
      )}

      {finish === 'two_tone' && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="18" width="36" height="18" fill="#F8FAFC" opacity="0.94" />
          <line x1="0" y1="18" x2="36" y2="18" stroke="#0F172A" strokeWidth="1" opacity="0.45" />
        </g>
      )}

      {finish === 'racing_stripe' && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="13.5" width="36" height="9" fill="#F8FAFC" />
          <rect x="0" y="16.5" width="36" height="3" fill="#0F172A" />
        </g>
      )}

      {finish === 'frosted_ice' && (
        <path
          d="M7 10 L16 16 L10 27 M16 16 L26 8 M20 22 L29 27"
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.2"
          clipPath={`url(#${clipId})`}
        />
      )}

      {finish === 'galaxy' && (
        <g clipPath={`url(#${clipId})`}>
          <circle cx="9" cy="11" r="1" fill="#FFFFFF" />
          <circle cx="14" cy="25" r="1.1" fill="#E9D5FF" />
          <circle cx="22" cy="9" r="0.9" fill="#FFFFFF" />
          <circle cx="11" cy="19" r="0.8" fill="#BAE6FD" />
          <circle cx="20" cy="24" r="1" fill="#FFFFFF" />
        </g>
      )}

      {finish === 'amber_fossil' && (
        <g clipPath={`url(#${clipId})`} fill="rgba(69,26,3,0.68)">
          <polygon points="8,12 15,8 14,16" />
          <polygon points="9,24 16,20 13,29" />
          <polygon points="18,9 24,7 21,13" />
        </g>
      )}

      {finish === 'molten_cracks' && (
        <g clipPath={`url(#${clipId})`}>
          <circle cx="18" cy="18" r="15.5" fill="#1C1917" />
          <path d="M5 9 L14 16 L9 27 M14 16 L24 9 M15 19 L25 28" fill="none" stroke="#EA580C" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M5 9 L14 16 L9 27 M14 16 L24 9 M15 19 L25 28" fill="none" stroke="#FEF08A" strokeWidth="1" strokeLinecap="round" />
        </g>
      )}

      {finish === 'cyber_matrix' && (
        <g clipPath={`url(#${clipId})`}>
          <circle cx="18" cy="18" r="15.5" fill="#03150B" />
          <rect x="7" y="7" width="2.4" height="6" fill="#4ADE80" />
          <rect x="7" y="18" width="2.4" height="5" fill="#22D3EE" />
          <rect x="13" y="11" width="2.4" height="7" fill="#4ADE80" />
          <rect x="19" y="6" width="2.4" height="5" fill="#22D3EE" />
          <rect x="19" y="17" width="2.4" height="8" fill="#4ADE80" />
          <rect x="25" y="12" width="2.4" height="6" fill="#22D3EE" />
        </g>
      )}

      {finish === 'electric_arc' && (
        <g clipPath={`url(#${clipId})`}>
          <circle cx="18" cy="18" r="15.5" fill="#082F49" />
          <path d="M5 12 L13 17 L18 11 L24 19 M7 25 L14 21 L21 27" fill="none" stroke="#38BDF8" strokeWidth="2.2" />
          <path d="M5 12 L13 17 L18 11 L24 19 M7 25 L14 21 L21 27" fill="none" stroke="#FFFFFF" strokeWidth="0.9" />
        </g>
      )}

      {finish === 'mummy' && (
        <g clipPath={`url(#${clipId})`}>
          <circle cx="18" cy="18" r="15.5" fill="#E7E5E4" />
          <path d="M2 8 L34 12 M2 15 L34 19 M2 23 L34 27 M2 29 L34 32" stroke="#78716C" strokeWidth="1.2" />
          <rect x="2" y="16" width="32" height="4" fill="rgba(168,162,158,0.38)" />
        </g>
      )}

      {finish === 'camo' && (
        <g clipPath={`url(#${clipId})`}>
          <ellipse cx="11" cy="11" rx="6" ry="4" fill="#365314" />
          <ellipse cx="22" cy="24" rx="6.5" ry="4.5" fill="#78350F" />
          <ellipse cx="10" cy="23" rx="5" ry="3.5" fill="#A16207" />
          <ellipse cx="21" cy="11" rx="5.5" ry="4" fill="#14532D" />
        </g>
      )}

      {finish === 'hazard' && (
        <g clipPath={`url(#${clipId})`} fill="#090D16">
          <polygon points="0,3 6,3 -6,36 -12,36" />
          <polygon points="10,3 16,3 4,36 -2,36" />
          <polygon points="20,3 26,3 14,36 8,36" />
          <polygon points="30,3 36,3 24,36 18,36" />
        </g>
      )}

      {finish === 'damascus' && (
        <path
          d="M2 10 Q10 6 18 10 T34 10 M2 16 Q10 12 18 16 T34 16 M2 22 Q10 18 18 22 T34 22 M2 28 Q10 24 18 28 T34 28"
          fill="none"
          stroke="rgba(15,23,42,0.45)"
          strokeWidth="1.4"
          clipPath={`url(#${clipId})`}
        />
      )}

      {finish === 'hologram' && (
        <g clipPath={`url(#${clipId})`}>
          <path d="M2 8 H34 M2 13 H34 M2 18 H34 M2 23 H34 M2 28 H34" stroke="rgba(165,243,252,0.4)" strokeWidth="0.9" />
          <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(103,232,249,0.88)" strokeWidth="1.6" />
        </g>
      )}

      {finish === 'kintsugi' && (
        <g clipPath={`url(#${clipId})`} fill="none">
          <path d="M5 10 L14 16 L9 27 M14 16 L24 9" stroke="#57534E" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M5 10 L14 16 L9 27 M14 16 L24 9" stroke="#FBBF24" strokeWidth="1.3" strokeLinecap="round" />
        </g>
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
