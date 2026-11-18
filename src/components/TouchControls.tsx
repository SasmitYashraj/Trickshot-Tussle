import { useRef, useState } from 'react';

interface TouchControlsProps {
  ammo: number;
  stunned: boolean;
  alive: boolean;
  onStickChange: (active: boolean, angle: number, magnitude: number) => void;
  onStickRelease: () => void;
}

export function TouchControls({
  ammo,
  stunned,
  alive,
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
        style={{ width: 'clamp(108px, 28dvh, 140px)', height: 'clamp(108px, 28dvh, 140px)' }}
        className={`relative rounded-full border-2 flex items-center justify-center transition-colors ${
          knobOffset.active
            ? 'border-sky-400/80 bg-slate-950/45 shadow-[0_0_24px_rgba(56,189,248,0.22)]'
            : 'border-slate-400/45 bg-slate-950/25'
        }`}
      >
        {/* Subtle cardinal direction guides */}
        <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-slate-400/20" />
        <div className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-slate-400/20" />

        {/* Inner Deadzone Guide */}
        <div className="h-5 w-5 rounded-full border border-dashed border-amber-300/35 pointer-events-none" />

        {/* Movable Tactile Thumb Knob */}
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
          className={`pointer-events-none absolute h-[40%] w-[40%] rounded-full border-2 border-slate-950 shadow-lg flex items-center justify-center ${
            armed
              ? 'bg-amber-400 shadow-[0_0_16px_rgba(250,204,21,0.45)]'
              : knobOffset.active
                ? 'bg-sky-400'
                : 'bg-sky-400/80'
          }`}
        >
          <div className="h-3.5 w-3.5 rounded-full bg-slate-950/30" />
        </div>
      </div>
    </div>
  );
}
