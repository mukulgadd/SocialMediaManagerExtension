import { useState, useCallback, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Add user message
    const userMsg: ChatMessage = { id: `msg-${Date.now()}`, role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Clean up existing port
    if (portRef.current) {
      portRef.current.disconnect();
    }

    const port = chrome.runtime.connect({ name: 'ai-stream' });
    portRef.current = port;

    let accumulated = '';

    port.onMessage.addListener((message) => {
      if (message.type === 'AI_STREAM_CHUNK') {
        accumulated += message.chunk.delta;
        setStreamingText(accumulated);

        if (message.chunk.done) {
          finishStream(accumulated);
          port.disconnect();
          portRef.current = null;
        }
      } else if (message.type === 'AI_STREAM_DONE') {
        finishStream(accumulated);
        port.disconnect();
        portRef.current = null;
      } else if (message.type === 'AI_STREAM_ERROR') {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          content: `Error: ${message.error}`,
        };
        setMessages((prev) => [...prev, errorMsg]);
        setIsStreaming(false);
        setStreamingText('');
        port.disconnect();
        portRef.current = null;
      }
    });

    port.onDisconnect.addListener(() => {
      if (isStreaming && accumulated) {
        finishStream(accumulated);
      }
      portRef.current = null;
    });

    port.postMessage({ type: 'CHAT_MESSAGE', message: text });
  }, [input, isStreaming]);

  const finishStream = (content: string) => {
    if (content) {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
    setIsStreaming(false);
    setStreamingText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <span className="text-3xl mb-3">💬</span>
            <h2 className="text-sm font-medium text-slate-200">Ask anything</h2>
            <p className="mt-1 text-xs text-slate-400 max-w-[240px]">
              Draft a comment, rewrite a post, brainstorm content ideas, or ask for engagement tips.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {['Draft a comment for this post', 'Rewrite this more professionally', 'Give me 5 post ideas about AI'].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-2.5 py-1.5 text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600/50 rounded-md transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-100'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.role === 'assistant' && (
                <button
                  onClick={() => handleCopy(msg.content)}
                  className="mt-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Copy
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed bg-slate-700 text-slate-100">
              <div className="whitespace-pre-wrap">{streamingText || '...'}</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-700 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... (Enter to send)"
            rows={2}
            disabled={isStreaming}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isStreaming ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
