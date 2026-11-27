import { useRef, useState } from 'react';
import type { JoystickSize } from '../game/settings';
import type { PlayerSkinFinish } from '../game/types';
import { PlayerAvatar } from './PlayerAvatar';

interface TouchControlsProps {
  ammo: number;
  stunned: boolean;
  alive: boolean;
  playerColor?: string;
  playerAccentColor?: string;
  playerFinish?: PlayerSkinFinish;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  size?: JoystickSize;
  releaseJitterProtection?: boolean;
  rotatedLandscape?: boolean;
  playerLabel?: string;
  onStickChange: (active: boolean, angle: number, magnitude: number) => void;
  onStickRelease: (stabilizedAngle?: number) => void;
}

const JOYSTICK_SIZE_CLAMP: Record<JoystickSize, string> = {
  SMALL: 'clamp(108px, 28vmin, 140px)',
  MEDIUM: 'clamp(138px, 35vmin, 176px)',
  LARGE: 'clamp(164px, 42vmin, 212px)',
};

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

function shortestAngleDiff(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

export function TouchControls({
  ammo,
  stunned,
  alive,
  playerColor = '#0EA5E9',
  playerAccentColor = '#7DD3FC',
  playerFinish = 'solid',
  position = 'bottom-left',
  size = 'MEDIUM',
  releaseJitterProtection = true,
  rotatedLandscape = false,
  playerLabel,
  onStickChange,
  onStickRelease,
}: TouchControlsProps) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastAngleRef = useRef<number>(0);
  const angleHistoryRef = useRef<Array<{ t: number; angle: number }>>([]);

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
    const layoutW = el.clientWidth || rect.width;
    const maxRadius = Math.max(36, layoutW * 0.42);
    const minAngleDist = Math.max(8, maxRadius * 0.14);
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const rawDx = clientX - cx;
    const rawDy = clientY - cy;
    // When parent arena is rotated +90deg clockwise (portrait phone in auto-landscape mode),
    // screen +Y maps to landscape +X and screen -X maps to landscape +Y.
    const dx = rotatedLandscape ? rawDy : rawDx;
    const dy = rotatedLandscape ? -rawDx : rawDy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);

    let angle = lastAngleRef.current;
    if (dist >= minAngleDist) {
      angle = Math.atan2(dy, dx);
      lastAngleRef.current = angle;
      const now = performance.now();
      const hist = angleHistoryRef.current;
      hist.push({ t: now, angle });
      while (hist.length > 0 && now - hist[0].t > 160) {
        hist.shift();
      }
    }

    const visX = dist > 0.001 ? (dx / dist) * clamped : 0;
    const visY = dist > 0.001 ? (dy / dist) * clamped : 0;
    const magnitude = clamped / maxRadius;

    setKnobOffset({
      x: visX,
      y: visY,
      active: true,
    });
    onStickChange(true, angle, magnitude);
  };

  const resolveReleaseAngle = (): number => {
    const rawAngle = lastAngleRef.current;
    if (!releaseJitterProtection) return rawAngle;
    const now = performance.now();
    const hist = angleHistoryRef.current;
    let candidate: { t: number; angle: number } | undefined;
    for (let i = hist.length - 1; i >= 0; i--) {
      const age = now - hist[i].t;
      if (age >= 28 && age <= 105) {
        candidate = hist[i];
        break;
      }
    }
    if (!candidate) {
      for (let i = hist.length - 1; i >= 0; i--) {
        const age = now - hist[i].t;
        if (age >= 20 && age <= 125) {
          candidate = hist[i];
          break;
        }
      }
    }
    if (!candidate) return rawAngle;
    if (Math.abs(shortestAngleDiff(rawAngle, candidate.angle)) <= 0.42) {
      return candidate.angle;
    }
    return rawAngle;
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
    angleHistoryRef.current = [];
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
    const releaseAngle = shouldShoot ? resolveReleaseAngle() : lastAngleRef.current;
    lastAngleRef.current = releaseAngle;
    angleHistoryRef.current = [];
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0, active: false });
    onStickChange(false, releaseAngle, 0);
    if (shouldShoot) {
      onStickRelease(releaseAngle);
    }
  };

  const baseBorderColor = knobOffset.active
    ? hexToRgba(playerColor, 0.88)
    : hexToRgba(playerColor, 0.52);

  const posStyle: React.CSSProperties =
    position === 'top-right'
      ? {
          touchAction: 'none',
          right: 'max(0.75rem, env(safe-area-inset-right))',
          top: 'max(0.75rem, env(safe-area-inset-top))',
        }
      : position === 'top-left'
        ? {
            touchAction: 'none',
            left: 'max(0.75rem, env(safe-area-inset-left))',
            top: 'max(0.75rem, env(safe-area-inset-top))',
          }
        : position === 'bottom-right'
          ? {
              touchAction: 'none',
              right: 'max(0.75rem, env(safe-area-inset-right))',
              bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }
          : {
              touchAction: 'none',
              left: 'max(0.75rem, env(safe-area-inset-left))',
              bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            };

  const labelPosClass =
    position === 'top-right'
      ? 'bottom-1.5 left-1.5'
      : position === 'top-left'
        ? 'bottom-1.5 right-1.5'
        : position === 'bottom-right'
          ? 'top-1.5 left-1.5'
          : 'top-1.5 right-1.5';

  const padDimension = JOYSTICK_SIZE_CLAMP[size] ?? JOYSTICK_SIZE_CLAMP.MEDIUM;

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
          width: padDimension,
          height: padDimension,
          borderColor: baseBorderColor,
          backgroundColor: 'transparent',
        }}
        className="relative rounded-full border-2 flex items-center justify-center transition-colors"
      >
        {playerLabel && (
          <span
            className={`pointer-events-none absolute font-mono-tabular text-[10px] font-black tracking-wider px-1.5 py-0.5 rounded bg-slate-950/75 text-slate-100 border border-white/15 ${labelPosClass}`}
          >
            {playerLabel}
          </span>
        )}

        {/* Solid Tactile Thumb Knob */}
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
          className={`pointer-events-none absolute h-[38%] w-[38%] rounded-full flex items-center justify-center ${
            armed ? 'ring-2 ring-amber-300/85' : ''
          }`}
        >
          <PlayerAvatar
            color={playerColor}
            accentColor={playerAccentColor}
            finish={playerFinish}
            showVisor={false}
            className="!h-full !w-full"
          />
        </div>
      </div>
    </div>
  );
}
