import { useId, useRef, useState } from 'react';
import type { PlayerSkinFinish } from '../game/types';

interface TouchControlsProps {
  ammo: number;
  stunned: boolean;
  alive: boolean;
  playerColor?: string;
  playerAccentColor?: string;
  playerFinish?: PlayerSkinFinish;
  onStickChange: (active: boolean, angle: number, magnitude: number) => void;
  onStickRelease: () => void;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(56, 189, 248, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(56, 189, 248, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TouchControls({
  ammo,
  stunned,
  alive,
  playerColor = '#0EA5E9',
  playerAccentColor = '#7DD3FC',
  playerFinish = 'solid',
  onStickChange,
  onStickRelease,
}: TouchControlsProps) {
  const uid = useId().replace(/:/g, '_');
  const gradId = `joy_grad_${uid}`;
  const patId = `joy_pat_${uid}`;
  const clipId = `joy_clip_${uid}`;

  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastAngleRef = useRef<number>(0);

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  const armed = alive && ammo > 0 && !stunned;

  const updateFromClientPos = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxRadius = Math.max(36, rect.width * 0.4);
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = dist > 0.5 ? Math.atan2(dy, dx) : lastAngleRef.current;
    lastAngleRef.current = angle;
    const magnitude = clamped / maxRadius;

    setKnobOffset({
      x: Math.cos(angle) * clamped,
      y: Math.sin(angle) * clamped,
      active: true,
    });
    onStickChange(true, angle, magnitude);
  };

  const handlePadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    updateFromClientPos(e.clientX, e.clientY);
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    updateFromClientPos(e.clientX, e.clientY);
  };

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>, shouldShoot: boolean) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0, active: false });
    onStickChange(false, lastAngleRef.current, 0);
    if (shouldShoot) {
      onStickRelease();
    }
  };

  const baseBorderColor = knobOffset.active
    ? hexToRgba(playerColor, 0.85)
    : hexToRgba(playerColor, 0.48);
  const baseGlowColor = hexToRgba(playerColor, knobOffset.active ? 0.28 : 0.12);
  const guideColor = hexToRgba(playerAccentColor, 0.24);
  const deadzoneColor = armed ? 'rgba(250, 204, 21, 0.5)' : hexToRgba(playerAccentColor, 0.35);

  return (
    <div
      onPointerDown={handlePadPointerDown}
      onPointerMove={handlePadPointerMove}
      onPointerUp={(e) => finishPointer(e, true)}
      onPointerCancel={(e) => finishPointer(e, false)}
      style={{
        touchAction: 'none',
        left: 'max(0.75rem, env(safe-area-inset-left))',
        bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      className="absolute z-20 p-1.5 cursor-pointer select-none"
      aria-label="Movement Joystick"
    >
      <div
        ref={baseRef}
        style={{
          width: 'clamp(108px, 28dvh, 140px)',
          height: 'clamp(108px, 28dvh, 140px)',
          borderColor: baseBorderColor,
          backgroundColor: knobOffset.active ? 'rgba(2, 6, 23, 0.46)' : 'rgba(2, 6, 23, 0.26)',
          boxShadow: `0 0 24px ${baseGlowColor}, inset 0 0 18px ${hexToRgba(playerColor, 0.08)}`,
        }}
        className="relative rounded-full border-2 flex items-center justify-center transition-colors"
      >
        {/* Subtle cardinal direction guides */}
        <div
          style={{ backgroundColor: guideColor }}
          className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2"
        />
        <div
          style={{ backgroundColor: guideColor }}
          className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2"
        />

        {/* Inner Deadzone Guide */}
        <div
          style={{ borderColor: deadzoneColor }}
          className="h-5 w-5 rounded-full border border-dashed pointer-events-none"
        />

        {/* Movable Tactile Thumb Knob matching player color & finish texture */}
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            boxShadow: armed
              ? `0 0 18px rgba(250, 204, 21, 0.55), 0 4px 12px rgba(0, 0, 0, 0.55)`
              : `0 0 14px ${hexToRgba(playerColor, knobOffset.active ? 0.48 : 0.26)}, 0 4px 12px rgba(0, 0, 0, 0.55)`,
          }}
          className={`pointer-events-none absolute h-[42%] w-[42%] rounded-full flex items-center justify-center ${
            armed ? 'ring-2 ring-amber-300/80' : ''
          }`}
        >
          <svg viewBox="0 0 36 36" className="h-full w-full drop-shadow-sm" aria-hidden="true">
            <defs>
              <clipPath id={clipId}>
                <circle cx="18" cy="18" r="16" />
              </clipPath>

              {playerFinish === 'metal' ? (
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#F8FAFC" />
                  <stop offset="28%" stopColor={playerAccentColor} />
                  <stop offset="52%" stopColor="#475569" />
                  <stop offset="76%" stopColor="#E2E8F0" />
                  <stop offset="100%" stopColor="#1E293B" />
                </linearGradient>
              ) : (
                <radialGradient id={gradId} cx="34%" cy="30%" r="72%">
                  <stop offset="0%" stopColor="#FFFFFF" />
                  <stop offset="24%" stopColor={playerAccentColor} />
                  <stop offset="70%" stopColor={playerColor} />
                  <stop offset="100%" stopColor="#0F172A" />
                </radialGradient>
              )}

              {playerFinish === 'fish_scale' && (
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

              {playerFinish === 'wood' && (
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

              {playerFinish === 'metal' && (
                <pattern id={patId} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                  <line x1="0" y1="2" x2="12" y2="2" stroke="rgba(255,255,255,0.45)" strokeWidth="1.3" />
                  <line x1="0" y1="6" x2="12" y2="6" stroke="rgba(15,23,42,0.28)" strokeWidth="1" />
                  <line x1="0" y1="10" x2="12" y2="10" stroke="rgba(241,245,249,0.25)" strokeWidth="1" />
                </pattern>
              )}
            </defs>

            <circle cx="18" cy="18" r="16" fill={`url(#${gradId})`} stroke="#090D16" strokeWidth="2.4" />

            {playerFinish !== 'solid' && playerFinish !== 'animated_sparkle' && (
              <circle cx="18" cy="18" r="16" fill={`url(#${patId})`} clipPath={`url(#${clipId})`} />
            )}

            {playerFinish === 'animated_sparkle' && (
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

            {/* Tactile inner grip dimple */}
            <circle cx="18" cy="18" r="5" fill="rgba(9, 13, 22, 0.34)" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
          </svg>
        </div>
      </div>
    </div>
  );
}
