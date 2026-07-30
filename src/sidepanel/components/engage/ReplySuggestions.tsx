import { useState } from 'react';

interface ReplySuggestionsProps {
  text: string;
  isStreaming: boolean;
  error: string | null;
  onCopy: (text: string) => void;
}

export function ReplySuggestions({ text, isStreaming, error, onCopy }: ReplySuggestionsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (error) {
    return (
      <div className="mt-2 p-3 bg-red-900/20 border border-red-700/30 rounded-md text-xs text-red-300">
        Error: {error}
      </div>
    );
  }

  if (isStreaming && !text) {
    return (
      <div className="mt-2 p-3 bg-slate-700/50 rounded-md">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <span className="animate-pulse">●</span>
          <span className="animate-pulse animation-delay-200">●</span>
          <span className="animate-pulse animation-delay-400">●</span>
          <span className="ml-2">Generating suggestions...</span>
        </div>
      </div>
    );
  }

  if (!text) return null;

  // Split suggestions by --- separator
  const suggestions = text.split('---').map((s) => s.trim()).filter(Boolean);

  const handleCopy = (suggestion: string, index: number) => {
    navigator.clipboard.writeText(suggestion).catch(() => {
      // Fallback: use onCopy which records the action
    });
    onCopy(suggestion);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="mt-2 space-y-2">
      {suggestions.map((suggestion, index) => {
        // Check for link suggestion
        const lines = suggestion.split('\n');
        const linkLine = lines.find((l) => l.startsWith('📎 Link:'));
        const replyLines = lines.filter((l) => !l.startsWith('📎 Link:'));
        const replyText = replyLines.join('\n').trim();

        return (
          <div key={index} className="p-3 bg-slate-700/50 border border-slate-600 rounded-md">
            <p className="text-xs text-slate-200 whitespace-pre-wrap">{replyText}</p>
            {linkLine && (
              <p className="mt-1 text-xs text-blue-400 font-medium">{linkLine}</p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => handleCopy(replyText, index)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 hover:bg-slate-500 rounded text-slate-200 transition-colors"
              >
                {copiedIndex === index ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>
        );
      })}
      {isStreaming && (
        <div className="text-xs text-slate-400 animate-pulse">Streaming...</div>
      )}
    </div>
  );
}
