import { useState, useCallback, useRef } from 'react';
import type { PostData, CommentData } from '../../shared/types';

interface AIStreamState {
  text: string;
  isStreaming: boolean;
  error: string | null;
}

interface UseAIStreamReturn extends AIStreamState {
  startStream: (postData: PostData, replyToComment?: CommentData) => void;
  reset: () => void;
}

/**
 * Opens a chrome.runtime.connect port for AI streaming.
 * Sends GENERATE_REPLY and accumulates AI_STREAM_CHUNK messages.
 */
export function useAIStream(): UseAIStreamReturn {
  const [state, setState] = useState<AIStreamState>({
    text: '',
    isStreaming: false,
    error: null,
  });
  const portRef = useRef<chrome.runtime.Port | null>(null);

  const startStream = useCallback((postData: PostData, replyToComment?: CommentData) => {
    // Clean up any existing port
    if (portRef.current) {
      portRef.current.disconnect();
    }

    setState({ text: '', isStreaming: true, error: null });

    const port = chrome.runtime.connect({ name: 'ai-stream' });
    portRef.current = port;

    port.onMessage.addListener((message) => {
      if (message.type === 'AI_STREAM_CHUNK') {
        setState((prev) => ({
          ...prev,
          text: prev.text + message.chunk.delta,
          isStreaming: !message.chunk.done,
        }));
      } else if (message.type === 'AI_STREAM_DONE') {
        setState((prev) => ({ ...prev, isStreaming: false }));
        port.disconnect();
        portRef.current = null;
      } else if (message.type === 'AI_STREAM_ERROR') {
        setState((prev) => ({ ...prev, isStreaming: false, error: message.error }));
        port.disconnect();
        portRef.current = null;
      }
    });

    port.onDisconnect.addListener(() => {
      setState((prev) => {
        if (prev.isStreaming) {
          return { ...prev, isStreaming: false, error: 'Connection lost' };
        }
        return prev;
      });
      portRef.current = null;
    });

    port.postMessage({
      type: 'GENERATE_REPLY',
      postData,
      replyToComment,
    });
  }, []);

  const reset = useCallback(() => {
    if (portRef.current) {
      portRef.current.disconnect();
      portRef.current = null;
    }
    setState({ text: '', isStreaming: false, error: null });
  }, []);

  return { ...state, startStream, reset };
}
