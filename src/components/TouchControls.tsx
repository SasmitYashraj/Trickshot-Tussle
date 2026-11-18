import { useRef, useState } from 'react';

interface TouchControlsProps {
  ammo: number;
  stunned: boolean;
  alive: boolean;
  onStickChange: (active: boolean, angle: number, magnitude: number) => void;
  onStickRelease: () => void;
}

const PAD_SIZE = 144; // Comfortable stationary pad for mobile thumb control
const MAX_RADIUS = 58;

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
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, MAX_RADIUS);
    const angle = dist > 0.5 ? Math.atan2(dy, dx) : lastAngleRef.current;
    lastAngleRef.current = angle;
    const magnitude = clamped / MAX_RADIUS;

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
      style={{ touchAction: 'none' }}
      className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 z-20 p-2 cursor-pointer select-none"
      aria-label="Movement Joystick"
    >
      <div
        ref={baseRef}
        style={{ width: PAD_SIZE, height: PAD_SIZE }}
        className={`relative rounded-full border-2 flex items-center justify-center transition-colors ${
          knobOffset.active
            ? 'border-sky-400/80 bg-slate-950/60 shadow-[0_0_24px_rgba(56,189,248,0.22)]'
            : 'border-slate-500/50 bg-slate-950/40'
        }`}
      >
        {/* Subtle cardinal direction guides */}
        <div className="pointer-events-none absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-slate-500/20" />
        <div className="pointer-events-none absolute inset-y-4 left-1/2 w-px -translate-x-1/2 bg-slate-500/20" />

        {/* Inner Deadzone Guide */}
        <div className="h-6 w-6 rounded-full border border-dashed border-amber-300/35 pointer-events-none" />

        {/* Movable Tactile Thumb Knob */}
        <div
          style={{
            transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
          className={`pointer-events-none absolute h-14 w-14 rounded-full border-2 border-slate-950 shadow-lg flex items-center justify-center ${
            armed
              ? 'bg-amber-400 shadow-[0_0_16px_rgba(250,204,21,0.45)]'
              : knobOffset.active
                ? 'bg-sky-400'
                : 'bg-sky-400/80'
          }`}
        >
          <div className="h-4 w-4 rounded-full bg-slate-950/30" />
        </div>
      </div>
    </div>
  );
}
