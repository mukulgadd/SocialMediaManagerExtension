import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Platform, ScoredPost, LimiterState, LimiterConfig } from '../../shared/types';
import { CONFIG } from '../../shared/constants';

export interface AppState {
  platform: Platform;
  setPlatform: (p: Platform) => void;
  scoredPosts: ScoredPost[];
  setScoredPosts: (posts: ScoredPost[]) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  limiterState: LimiterState;
  setLimiterState: (s: LimiterState) => void;
  limiterConfig: LimiterConfig;
  setLimiterConfig: (c: LimiterConfig) => void;
  activeTab: 'engage' | 'draft' | 'summary' | 'queue' | 'chat' | 'settings';
  setActiveTab: (tab: 'engage' | 'draft' | 'summary' | 'queue' | 'chat' | 'settings') => void;
}

const defaultLimiterState: LimiterState = {
  lastActionTimestamp: 0,
  dailyActionCount: 0,
  dailyResetDate: new Date().toISOString().split('T')[0],
};

const defaultLimiterConfig: LimiterConfig = {
  cooldownSeconds: CONFIG.DEFAULT_COOLDOWN_SECONDS,
  dailyCap: CONFIG.DEFAULT_DAILY_CAP,
};

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>('unsupported');
  const [scoredPosts, setScoredPosts] = useState<ScoredPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [limiterState, setLimiterState] = useState<LimiterState>(defaultLimiterState);
  const [limiterConfig, setLimiterConfig] = useState<LimiterConfig>(defaultLimiterConfig);
  const [activeTab, setActiveTab] = useState<'engage' | 'draft' | 'summary' | 'queue' | 'chat' | 'settings'>('engage');

  const value: AppState = {
    platform,
    setPlatform: useCallback((p: Platform) => setPlatform(p), []),
    scoredPosts,
    setScoredPosts: useCallback((posts: ScoredPost[]) => setScoredPosts(posts), []),
    isLoading,
    setIsLoading: useCallback((v: boolean) => setIsLoading(v), []),
    limiterState,
    setLimiterState: useCallback((s: LimiterState) => setLimiterState(s), []),
    limiterConfig,
    setLimiterConfig: useCallback((c: LimiterConfig) => setLimiterConfig(c), []),
    activeTab,
    setActiveTab: useCallback((tab: 'engage' | 'draft' | 'summary' | 'queue' | 'chat' | 'settings') => setActiveTab(tab), []),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
