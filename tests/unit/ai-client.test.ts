import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamCompletion, isAIError, forwardStreamToPort, type AIClientError } from '../../src/background/ai-client';
import type { StreamChunk, ChatMessage } from '../../src/shared/messages';

// Helper to create a mock ReadableStream that yields SSE data
function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// Helper to create an SSE data line from a content string
function sseDataLine(content: string): string {
  const payload = JSON.stringify({
    choices: [{ delta: { content } }],
  });
  return `data: ${payload}\n\n`;
}

const testMessages: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

describe('ai-client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('streamCompletion', () => {
    it('yields multiple chunks then done on successful stream', async () => {
      const sseData = [
        sseDataLine('Hello'),
        sseDataLine(' world'),
        'data: [DONE]\n\n',
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(sseData),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { delta: 'Hello', done: false },
        { delta: ' world', done: false },
        { delta: '', done: true },
      ]);
    });

    it('handles SSE comments and empty lines gracefully', async () => {
      const sseData = [
        ': this is a comment\n\n',
        '\n',
        sseDataLine('content'),
        'data: [DONE]\n\n',
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(sseData),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { delta: 'content', done: false },
        { delta: '', done: true },
      ]);
    });

    it('skips malformed JSON in SSE lines and continues parsing', async () => {
      const sseData = [
        'data: {invalid json}\n\n',
        sseDataLine('valid'),
        'data: [DONE]\n\n',
      ];

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(sseData),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { delta: 'valid', done: false },
        { delta: '', done: true },
      ]);
    });

    it('yields done when stream ends without [DONE] signal', async () => {
      const sseData = [sseDataLine('partial')];

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(sseData),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { delta: 'partial', done: false },
        { delta: '', done: true },
      ]);
    });

    it('retries once on non-2xx then yields error on second failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null,
      });

      vi.stubGlobal('fetch', mockFetch);

      const resultPromise = (async () => {
        const results: (StreamChunk | AIClientError)[] = [];
        for await (const chunk of streamCompletion(testMessages)) {
          results.push(chunk);
        }
        return results;
      })();

      // Advance timer for the 2s retry delay
      await vi.advanceTimersByTimeAsync(2000);

      const results = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'error',
        statusCode: 500,
        message: 'AI request failed: HTTP 500 Internal Server Error',
      });
    });

    it('retries once on network error then yields error on second failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      vi.stubGlobal('fetch', mockFetch);

      const resultPromise = (async () => {
        const results: (StreamChunk | AIClientError)[] = [];
        for await (const chunk of streamCompletion(testMessages)) {
          results.push(chunk);
        }
        return results;
      })();

      // Advance timer for the 2s retry delay
      await vi.advanceTimersByTimeAsync(2000);

      const results = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'error',
        message: 'AI request failed: Network failure',
      });
    });

    it('retries once on timeout then yields timeout error', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      const mockFetch = vi.fn().mockRejectedValue(abortError);

      vi.stubGlobal('fetch', mockFetch);

      const resultPromise = (async () => {
        const results: (StreamChunk | AIClientError)[] = [];
        for await (const chunk of streamCompletion(testMessages)) {
          results.push(chunk);
        }
        return results;
      })();

      // Advance timer for the 2s retry delay
      await vi.advanceTimersByTimeAsync(2000);

      const results = await resultPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'error',
        message: 'AI request timed out after 30 seconds',
      });
    });

    it('yields error when response body is null', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        body: null,
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: 'error', message: 'No response body' },
      ]);
    });

    it('sends correct request parameters', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(['data: [DONE]\n\n']),
      });

      vi.stubGlobal('fetch', mockFetch);

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages, { temperature: 0.5 })) {
        results.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:20128/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer sk-0a3500b3fd7c8518-67ffa7-8f81e845`,
          },
          body: JSON.stringify({
            model: 'auto',
            messages: testMessages,
            stream: true,
            temperature: 0.5,
          }),
        }),
      );
    });

    it('uses default temperature of 0.7 when not specified', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(['data: [DONE]\n\n']),
      });

      vi.stubGlobal('fetch', mockFetch);

      const results: (StreamChunk | AIClientError)[] = [];
      for await (const chunk of streamCompletion(testMessages)) {
        results.push(chunk);
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
    });
  });

  describe('isAIError', () => {
    it('returns true for error objects', () => {
      const error: AIClientError = { type: 'error', message: 'fail' };
      expect(isAIError(error)).toBe(true);
    });

    it('returns false for stream chunks', () => {
      const chunk: StreamChunk = { delta: 'hello', done: false };
      expect(isAIError(chunk)).toBe(false);
    });
  });

  describe('forwardStreamToPort', () => {
    it('forwards stream chunks and done signal to port', async () => {
      const sseData = [
        sseDataLine('Hi'),
        'data: [DONE]\n\n',
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: createSSEStream(sseData),
      }));

      const postMessage = vi.fn();
      const mockPort = { postMessage } as unknown as chrome.runtime.Port;

      await forwardStreamToPort(mockPort, testMessages, 'req-123');

      expect(postMessage).toHaveBeenCalledWith({
        type: 'AI_STREAM_CHUNK',
        chunk: { delta: 'Hi', done: false },
        requestId: 'req-123',
      });
      expect(postMessage).toHaveBeenCalledWith({
        type: 'AI_STREAM_CHUNK',
        chunk: { delta: '', done: true },
        requestId: 'req-123',
      });
      expect(postMessage).toHaveBeenCalledWith({
        type: 'AI_STREAM_DONE',
        requestId: 'req-123',
      });
    });

    it('forwards error to port on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        body: null,
      }));

      const postMessage = vi.fn();
      const mockPort = { postMessage } as unknown as chrome.runtime.Port;

      await forwardStreamToPort(mockPort, testMessages, 'req-456');

      expect(postMessage).toHaveBeenCalledWith({
        type: 'AI_STREAM_ERROR',
        error: 'No response body',
        requestId: 'req-456',
      });
    });
  });
});
