import { useState } from 'react';
import type { ScoredPost, CommentData } from '../../../shared/types';
import { ThreadingAdvice } from './ThreadingAdvice';
import { ReplySuggestions } from './ReplySuggestions';
import { CooldownTimer } from './CooldownTimer';
import { useAIStream } from '../../hooks/useAIStream';
import { useLimiter } from '../../hooks/useLimiter';

interface PostCardProps {
  post: ScoredPost;
}

function getScoreBadge(category: 'high' | 'medium' | 'low') {
  switch (category) {
    case 'high':
      return { text: 'High', className: 'bg-green-900/40 text-green-300 border-green-700/50' };
    case 'medium':
      return { text: 'Medium', className: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50' };
    case 'low':
      return { text: 'Low', className: 'bg-slate-700/50 text-slate-400 border-slate-600/50' };
  }
}

export function PostCard({ post }: PostCardProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { text, isStreaming, error, startStream, reset } = useAIStream();
  const { isAllowed, cooldownRemaining, recordCopy } = useLimiter();

  const badge = getScoreBadge(post.scoreCategory);
  const contentPreview = post.content.length > 100
    ? post.content.slice(0, 100) + '…'
    : post.content;

  const handleSuggestReply = () => {
    if (!isAllowed) return;
    setShowSuggestions(true);

    // Determine if we should reply to a comment
    let replyToComment: CommentData | undefined;
    if (post.threadingAdvice?.suggestReplyToComment && post.threadingAdvice.topComment) {
      replyToComment = post.threadingAdvice.topComment;
    }

    startStream(post, replyToComment);
  };

  const handleCopy = (replyText: string) => {
    recordCopy(replyText);
  };

  const handleClose = () => {
    reset();
    setShowSuggestions(false);
  };

  return (
    <article className="relative p-3 bg-slate-800 border border-slate-700 rounded-lg">
      {/* Cooldown overlay */}
      <CooldownTimer secondsRemaining={cooldownRemaining} />

      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200 truncate">{post.author.name}</span>
            {post.isTrackedCreator && <span className="text-xs" title="Tracked creator">🎯</span>}
            {post.isTrending && <span className="text-xs" title="Trending">🔥</span>}
          </div>
          {post.author.handle && (
            <span className="text-xs text-slate-500">@{post.author.handle}</span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded border ${badge.className}`}>
          {badge.text}
        </span>
      </div>

      {/* Early engagement prompt for tracked creators */}
      {post.isTrackedCreator && post.ageMinutes !== undefined && post.ageMinutes < 60 && (
        <div className="mt-1.5 px-2 py-1 bg-amber-900/30 border border-amber-700/40 rounded text-xs text-amber-300">
          ⚡ Posted {post.ageMinutes} min ago — comment early for visibility
        </div>
      )}

      {/* Content preview */}
      <p className="mt-2 text-xs text-slate-300 leading-relaxed">{contentPreview}</p>

      {/* Threading advice */}
      {post.threadingAdvice?.suggestReplyToComment && post.threadingAdvice.topComment && (
        <ThreadingAdvice topComment={post.threadingAdvice.topComment} />
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        {!showSuggestions ? (
          <button
            onClick={handleSuggestReply}
            disabled={!isAllowed}
            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded transition-colors"
          >
            Suggest Reply
          </button>
        ) : (
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs font-medium bg-slate-600 hover:bg-slate-500 text-slate-200 rounded transition-colors"
          >
            Close
          </button>
        )}
        <button
          onClick={() => {
            if (post.url) {
              chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
                if (tab?.id) {
                  // Try scrolling to the post on the current page first
                  chrome.tabs.sendMessage(tab.id, { type: 'FIND_POST', postId: post.id, url: post.url }).catch(() => {
                    // If content script can't find it, open the URL
                    if (post.url) chrome.tabs.update(tab.id!, { url: post.url });
                  });
                }
              });
            }
          }}
          className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
          title="Find this post on the page"
        >
          Find
        </button>
      </div>

      {/* Reply suggestions */}
      {showSuggestions && (
        <ReplySuggestions
          text={text}
          isStreaming={isStreaming}
          error={error}
          onCopy={handleCopy}
        />
      )}
    </article>
  );
}
