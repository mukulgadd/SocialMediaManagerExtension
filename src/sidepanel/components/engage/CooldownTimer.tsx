interface CooldownTimerProps {
  secondsRemaining: number;
}

export function CooldownTimer({ secondsRemaining }: CooldownTimerProps) {
  if (secondsRemaining <= 0) return null;

  return (
    <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center rounded-lg z-10">
      <div className="text-center">
        <p className="text-lg font-bold text-slate-200">Wait {secondsRemaining}s</p>
        <p className="text-xs text-slate-400 mt-1">Cooldown active</p>
      </div>
    </div>
  );
}
