import { useState, useCallback } from 'react';
import type { ResponseMessage } from '../../../shared/messages';

type SummaryState = 'idle' | 'scraping' | 'generating' | 'done' | 'no-data' | 'error';

export function SummaryTab() {
  const [state, setState] = useState<SummaryState>('idle');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setState('scraping');
    setError(null);
    setSummary('');

    try {
      // Step 1: Scrape the current feed
      const scrapeResponse: ResponseMessage | undefined = await chrome.runtime.sendMessage({
        type: 'SCRAPE_FEED',
      });

      if (!scrapeResponse) {
        setState('no-data');
        return;
      }

      // Check if we got useful data
      let analyticsData = '';

      if (scrapeResponse.type === 'SCORED_POSTS' && scrapeResponse.posts.length > 0) {
        // Summarize posts into analytics-ready text
        const posts = scrapeResponse.posts;
        const totalEngagement = posts.reduce(
          (acc, p) => ({
            likes: acc.likes + p.engagement.likes,
            comments: acc.comments + p.engagement.comments,
            reposts: acc.reposts + p.engagement.reposts,
          }),
          { likes: 0, comments: 0, reposts: 0 }
        );

        analyticsData = [
          `Feed Analysis: ${posts.length} posts scraped`,
          `Total Engagement: ${totalEngagement.likes} likes, ${totalEngagement.comments} comments, ${totalEngagement.reposts} reposts`,
          `Top posts by engagement:`,
          ...posts
            .slice(0, 5)
            .map(
              (p, i) =>
                `  ${i + 1}. "${p.content.slice(0, 80)}..." - ${p.engagement.likes} likes, ${p.engagement.comments} comments`
            ),
          `Average engagement per post: ${Math.round(totalEngagement.likes / posts.length)} likes`,
        ].join('\n');
      } else if (scrapeResponse.type === 'SCRAPE_RESULT') {
        if (!scrapeResponse.result.success || scrapeResponse.result.posts.length === 0) {
          setState('no-data');
          return;
        }
        // Use raw posts if not scored
        analyticsData = `Feed contains ${scrapeResponse.result.posts.length} posts. ${scrapeResponse.result.error || ''}`;
      } else {
        setState('no-data');
        return;
      }

      // Step 2: Generate summary from the analytics data
      setState('generating');

      const summaryResponse: ResponseMessage | undefined = await chrome.runtime.sendMessage({
        type: 'GENERATE_SUMMARY',
        analyticsData,
      });

      if (!summaryResponse) {
        setState('error');
        setError('No response from service worker');
        return;
      }

      if (summaryResponse.type === 'AI_STREAM_ERROR') {
        setState('error');
        setError(summaryResponse.error);
        return;
      }

      // If we get a streamed response or text back
      if ('text' in summaryResponse && typeof (summaryResponse as { text: string }).text === 'string') {
        setSummary((summaryResponse as { text: string }).text);
        setState('done');
      } else {
        // Fallback: show the analytics data we gathered
        setSummary(analyticsData);
        setState('done');
      }
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Failed to generate summary');
    }
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={state === 'scraping' || state === 'generating'}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {state === 'scraping'
          ? 'Scraping feed...'
          : state === 'generating'
            ? 'Generating summary...'
            : 'Generate Summary'}
      </button>

      {/* Loading State */}
      {(state === 'scraping' || state === 'generating') && (
        <div className="flex items-center justify-center p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400">
              {state === 'scraping' ? 'Analyzing current page...' : 'Generating insights...'}
            </p>
          </div>
        </div>
      )}

      {/* No Data State */}
      {state === 'no-data' && (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <span className="text-3xl mb-3">📊</span>
          <h3 className="text-sm font-medium text-slate-300">No analytics available</h3>
          <p className="mt-1 text-xs text-slate-400">
            Navigate to a supported platform feed and try again.
          </p>
        </div>
      )}

      {/* Error State */}
      {state === 'error' && error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Summary Display */}
      {state === 'done' && summary && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-300">Feed Summary</h3>
          <div className="p-4 bg-slate-700 border border-slate-600 rounded-lg">
            <pre className="text-sm text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
              {summary}
            </pre>
          </div>
        </div>
      )}

      {/* Idle State Info */}
      {state === 'idle' && (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <span className="text-3xl mb-3">📈</span>
          <h3 className="text-sm font-medium text-slate-300">Feed Insights</h3>
          <p className="mt-1 text-xs text-slate-400">
            Generate a summary of your current feed to understand engagement trends and top-performing content.
          </p>
        </div>
      )}
    </div>
  );
}
