import type { Platform } from '../../shared/types';
import { useAppContext } from '../context/AppContext';

function getPlatformBadge(platform: Platform): { icon: string; label: string } {
  switch (platform) {
    case 'linkedin':
      return { icon: '🟦', label: 'LinkedIn' };
    case 'x-twitter':
      return { icon: '✕', label: 'X' };
    default:
      return { icon: '⚪', label: 'Unsupported' };
  }
}

export function Header() {
  const { platform, setActiveTab } = useAppContext();
  const badge = getPlatformBadge(platform);

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-label={`Platform: ${badge.label}`}>
          {badge.icon}
        </span>
        <span className="text-sm font-medium text-slate-200">{badge.label}</span>
      </div>
      <button
        onClick={() => setActiveTab('settings')}
        className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Open settings"
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </header>
  );
}
