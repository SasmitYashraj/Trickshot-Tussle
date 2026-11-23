import { useRef, useState } from 'react';
import type { PlayerSkinFinish } from '../game/types';
import { PlayerAvatar } from './PlayerAvatar';

interface TouchControlsProps {
  ammo: number;
  stunned: boolean;
  alive: boolean;
  playerColor?: string;
  playerAccentColor?: string;
  playerFinish?: PlayerSkinFinish;
  position?: 'bottom-left' | 'top-right';
  playerLabel?: string;
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
  position = 'bottom-left',
  playerLabel,
  onStickChange,
  onStickRelease,
}: TouchControlsProps) {
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer capture failure
    }
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
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore synthetic pointer release failure
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

  const posStyle: React.CSSProperties =
    position === 'top-right'
      ? {
          touchAction: 'none',
          right: 'max(0.75rem, env(safe-area-inset-right))',
          top: 'max(0.75rem, env(safe-area-inset-top))',
        }
      : {
          touchAction: 'none',
          left: 'max(0.75rem, env(safe-area-inset-left))',
          bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        };

  return (
    <div
      onPointerDown={handlePadPointerDown}
      onPointerMove={handlePadPointerMove}
      onPointerUp={(e) => finishPointer(e, true)}
      onPointerCancel={(e) => finishPointer(e, false)}
      style={posStyle}
      className="absolute z-20 p-1.5 cursor-pointer select-none"
      aria-label={playerLabel ? `${playerLabel} Movement Joystick` : 'Movement Joystick'}
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

        {playerLabel && (
          <span
            className={`pointer-events-none absolute font-mono-tabular text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded bg-slate-950/75 text-slate-100 border border-white/15 ${
              position === 'top-right' ? 'bottom-1.5 left-1.5' : 'top-1.5 right-1.5'
            }`}
          >
            {playerLabel}
          </span>
        )}

        {/* Movable Tactile Thumb Knob matching player color & finish texture */}
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            boxShadow: armed
              ? `0 0 18px rgba(250, 204, 21, 0.55), 0 4px 12px rgba(0, 0, 0, 0.55)`
              : `0 0 14px ${hexToRgba(playerColor, knobOffset.active ? 0.48 : 0.26)}, 0 4px 12px rgba(0, 0, 0, 0.55)`,
          }}
          className={`pointer-events-none absolute h-[44%] w-[44%] rounded-full flex items-center justify-center ${
            armed ? 'ring-2 ring-amber-300/80' : ''
          }`}
        >
          <PlayerAvatar
            color={playerColor}
            accentColor={playerAccentColor}
            finish={playerFinish}
            showVisor={false}
            className="!h-full !w-full"
          />
          <span className="pointer-events-none absolute h-[28%] w-[28%] rounded-full bg-slate-950/35 border border-white/25" />
        </div>
      </div>
    </div>
  );
}
