import { useState, useCallback, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { Platform } from '../../../shared/types';

interface DraftStreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

export function DraftTab() {
  const { platform } = useAppContext();

  const [topic, setTopic] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(
    platform !== 'unsupported' ? platform : 'linkedin'
  );
  const [draft, setDraft] = useState('');
  const [streamState, setStreamState] = useState<DraftStreamState>({
    text: '',
    isStreaming: false,
    error: null,
  });
  const [copied, setCopied] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const [showQueuePicker, setShowQueuePicker] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [queueAdded, setQueueAdded] = useState(false);

  const charLimit = selectedPlatform === 'x-twitter' ? 280 : null;
  const charCount = draft.length;
  const isOverLimit = charLimit !== null && charCount > charLimit;

  const startGeneration = useCallback(() => {
    if (!topic.trim()) return;

    // Clean up any existing port
    if (portRef.current) {
      portRef.current.disconnect();
    }

    setStreamState({ text: '', isStreaming: true, error: null });
    setDraft('');
    setCopied(false);

    const port = chrome.runtime.connect({ name: 'ai-stream' });
    portRef.current = port;

    port.onMessage.addListener((message) => {
      if (message.type === 'AI_STREAM_CHUNK') {
        setStreamState((prev) => {
          const newText = prev.text + message.chunk.delta;
          setDraft(newText);
          return {
            ...prev,
            text: newText,
            isStreaming: !message.chunk.done,
          };
        });
      } else if (message.type === 'AI_STREAM_DONE') {
        setStreamState((prev) => ({ ...prev, isStreaming: false }));
        port.disconnect();
        portRef.current = null;
      } else if (message.type === 'AI_STREAM_ERROR') {
        setStreamState((prev) => ({ ...prev, isStreaming: false, error: message.error }));
        port.disconnect();
        portRef.current = null;
      }
    });

    port.onDisconnect.addListener(() => {
      setStreamState((prev) => {
        if (prev.isStreaming) {
          return { ...prev, isStreaming: false, error: 'Connection lost' };
        }
        return prev;
      });
      portRef.current = null;
    });

    port.postMessage({
      type: 'GENERATE_DRAFT',
      topic: topic.trim(),
      platform: selectedPlatform,
    });
  }, [topic, selectedPlatform]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: use chrome.runtime message
      chrome.runtime.sendMessage({ type: 'COPY_REPLY', text: draft });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [draft]);

  const handleRegenerate = useCallback(() => {
    startGeneration();
  }, [startGeneration]);

  const handleAddToQueue = useCallback(async () => {
    if (!draft || !scheduledTime) return;
    const timestamp = new Date(scheduledTime).getTime();
    if (isNaN(timestamp) || timestamp < Date.now()) return;

    await chrome.runtime.sendMessage({
      type: 'QUEUE_ADD',
      content: draft,
      platform: selectedPlatform,
      scheduledTime: timestamp,
    });

    setQueueAdded(true);
    setShowQueuePicker(false);
    setScheduledTime('');
    setTimeout(() => setQueueAdded(false), 3000);
  }, [draft, scheduledTime, selectedPlatform]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Topic Input */}
      <div className="space-y-2">
        <label htmlFor="draft-topic" className="text-sm font-medium text-slate-300">
          What do you want to post about?
        </label>
        <textarea
          id="draft-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Describe your post topic, key points, or ideas..."
          className="w-full h-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={streamState.isStreaming}
        />
      </div>

      {/* Platform Selector */}
      <div className="space-y-2">
        <label htmlFor="draft-platform" className="text-sm font-medium text-slate-300">
          Platform
        </label>
        <select
          id="draft-platform"
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value as Platform)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={streamState.isStreaming}
        >
          <option value="linkedin">LinkedIn</option>
          <option value="x-twitter">X (Twitter)</option>
        </select>
      </div>

      {/* Generate Button */}
      <button
        onClick={startGeneration}
        disabled={!topic.trim() || streamState.isStreaming}
        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
      >
        {streamState.isStreaming ? 'Generating...' : 'Generate Draft'}
      </button>

      {/* Error Display */}
      {streamState.error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-sm text-red-300">{streamState.error}</p>
        </div>
      )}

      {/* Draft Output */}
      {(draft || streamState.isStreaming) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="draft-output" className="text-sm font-medium text-slate-300">
              Generated Draft
            </label>
            {/* Char count for X */}
            {charLimit && (
              <span
                className={`text-xs font-mono ${
                  isOverLimit ? 'text-red-400' : charCount > charLimit * 0.9 ? 'text-yellow-400' : 'text-slate-400'
                }`}
              >
                {charCount}/{charLimit}
              </span>
            )}
          </div>

          <textarea
            id="draft-output"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`w-full h-40 px-3 py-2 bg-slate-700 border rounded-lg text-sm text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              isOverLimit ? 'border-red-500' : 'border-slate-600'
            }`}
            disabled={streamState.isStreaming}
          />

          {/* Platform Tips */}
          {selectedPlatform === 'x-twitter' && isOverLimit && (
            <p className="text-xs text-red-400">
              Your draft exceeds the 280 character limit for X. Consider shortening or splitting into a thread.
            </p>
          )}
          {selectedPlatform === 'linkedin' && (
            <p className="text-xs text-slate-500">
              Tip: Use short paragraphs and line breaks to improve readability on LinkedIn.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={!draft || streamState.isStreaming}
              className="flex-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={!topic.trim() || streamState.isStreaming}
              className="flex-1 px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
            >
              Regenerate
            </button>
          </div>

          {/* Add to Queue */}
          {!showQueuePicker ? (
            <button
              onClick={() => setShowQueuePicker(true)}
              disabled={!draft || streamState.isStreaming}
              className="w-full px-3 py-2 bg-indigo-700/50 hover:bg-indigo-700/80 disabled:bg-slate-700 disabled:cursor-not-allowed text-indigo-200 text-sm rounded-lg border border-indigo-600/50 transition-colors"
            >
              {queueAdded ? '✓ Added to Queue' : '📋 Add to Queue'}
            </button>
          ) : (
            <div className="p-3 bg-slate-700/30 border border-slate-600/50 rounded-lg space-y-2">
              <label htmlFor="queue-time" className="text-xs font-medium text-slate-300">
                Schedule for
              </label>
              <input
                id="queue-time"
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full px-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddToQueue}
                  disabled={!scheduledTime}
                  className="flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                >
                  Schedule
                </button>
                <button
                  onClick={() => { setShowQueuePicker(false); setScheduledTime(''); }}
                  className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-slate-200 text-xs rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
