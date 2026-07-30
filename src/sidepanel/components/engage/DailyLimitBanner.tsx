interface DailyLimitBannerProps {
  dailyCap: number;
}

export function DailyLimitBanner({ dailyCap }: DailyLimitBannerProps) {
  return (
    <div className="mx-4 mt-3 px-3 py-2 bg-orange-900/30 border border-orange-700/40 rounded-md text-xs text-orange-200">
      Daily limit reached ({dailyCap}/{dailyCap}). Resets at midnight.
    </div>
  );
}
