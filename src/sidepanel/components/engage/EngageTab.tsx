import { useEffect, useCallback, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useLimiter } from '../../hooks/useLimiter';
import { PostCard } from './PostCard';
import { DailyLimitBanner } from './DailyLimitBanner';
import type { ResponseMessage } from '../../../shared/messages';

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-label="Loading posts">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 bg-slate-800 border border-slate-700 rounded-lg animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-24 h-4 bg-slate-700 rounded" />
            <div className="w-12 h-4 bg-slate-700 rounded" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="w-full h-3 bg-slate-700 rounded" />
            <div className="w-3/4 h-3 bg-slate-700 rounded" />
          </div>
          <div className="mt-3 w-20 h-6 bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  );
}

function UnsupportedPlatform() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <span className="text-4xl mb-4">🌐</span>
      <h2 className="text-base font-medium text-slate-200">Navigate to a supported platform</h2>
      <p className="mt-2 text-sm text-slate-400">
        Navigate to LinkedIn, X, YouTube, or Substack to get started
      </p>
    </div>
  );
}

export function EngageTab() {
  const { platform, scoredPosts, setScoredPosts, isLoading, setIsLoading } = useAppContext();
  const { isDailyLimitReached, dailyCap } = useLimiter();
  const [error, setError] = useState<string | null>(null);

  const refreshFeed = useCallback(() => {
    if (platform === 'unsupported') return;
    setIsLoading(true);
    setError(null);

    chrome.runtime.sendMessage({ type: 'SCRAPE_FEED' }).then((response: ResponseMessage | undefined) => {
      if (response?.type === 'SCORED_POSTS') {
        setScoredPosts(response.posts);
      } else if (response && 'result' in response) {
        const scrapeResult = (response as { result: { error?: string } }).result;
        if (scrapeResult?.error) {
          setError(scrapeResult.error);
        }
      }
      setIsLoading(false);
    }).catch((err) => {
      setError(err?.message || 'Failed to communicate with extension');
      setIsLoading(false);
    });
  }, [platform, setScoredPosts, setIsLoading]);

  useEffect(() => {
    refreshFeed();

    // Also listen for scored posts pushed from service worker
    const listener = (message: ResponseMessage) => {
      if (message.type === 'SCORED_POSTS') {
        setScoredPosts(message.posts);
        setIsLoading(false);
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [platform, setScoredPosts, setIsLoading, refreshFeed]);

  if (platform === 'unsupported') {
    return <UnsupportedPlatform />;
  }

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Sort posts: tracked creators first, then by score (highest first)
  const sortedPosts = [...scoredPosts].sort((a, b) => {
    if (a.isTrackedCreator && !b.isTrackedCreator) return -1;
    if (!a.isTrackedCreator && b.isTrackedCreator) return 1;
    return b.relevanceScore - a.relevanceScore;
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {isDailyLimitReached && <DailyLimitBanner dailyCap={dailyCap} />}

      {/* Refresh bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 bg-slate-800/90 backdrop-blur-sm border-b border-slate-700/50">
        <span className="text-xs text-slate-400">
          {sortedPosts.length} post{sortedPosts.length !== 1 ? 's' : ''} found
        </span>
        <button
          onClick={refreshFeed}
          disabled={isLoading}
          className="px-3 py-1 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-md transition-colors"
        >
          {isLoading ? 'Scanning...' : '↻ Refresh Feed'}
        </button>
      </div>

      {sortedPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <span className="text-3xl mb-3">📭</span>
          {error ? (
            <>
              <p className="text-sm text-red-400">{error}</p>
              <p className="mt-2 text-xs text-slate-500">Try refreshing the page (Ctrl+R), then hit Refresh Feed.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-400">No posts found. Try scrolling the feed, then hit Refresh.</p>
              <p className="mt-1 text-xs text-slate-500">Make sure you've refreshed the page after installing the extension.</p>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {sortedPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
