import type { CommentData } from '../../../shared/types';

interface ThreadingAdviceProps {
  topComment: CommentData;
}

export function ThreadingAdvice({ topComment }: ThreadingAdviceProps) {
  const previewContent = topComment.content.length > 60
    ? topComment.content.slice(0, 60) + '…'
    : topComment.content;

  return (
    <div className="mt-2 px-3 py-2 bg-amber-900/20 border border-amber-700/30 rounded-md text-xs text-amber-200">
      <span className="mr-1">💡</span>
      Reply to top comment by <span className="font-medium">{topComment.author}</span>: &ldquo;{previewContent}&rdquo; — gets more visibility
    </div>
  );
}
