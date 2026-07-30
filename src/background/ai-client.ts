import type { ChatMessage, StreamChunk } from '../shared/messages';
import { CONFIG } from '../shared/constants';

export interface AIClientError {
  type: 'error';
  statusCode?: number;
  message: string;
}

/**
 * Stream a chat completion from OmniRoute (OpenAI-compatible endpoint).
 *
 * - Uses SSE (Server-Sent Events) streaming
 * - Retries once on failure after 2s delay
 * - 30-second timeout via AbortController
 * - Yields StreamChunk objects for each token
 */
export async function* streamCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number }
): AsyncGenerator<StreamChunk | AIClientError> {
  const url = `${CONFIG.AI_BASE_URL}/v1/chat/completions`;

  let attempts = 0;
  const maxAttempts = CONFIG.AI_MAX_RETRIES + 1;

  while (attempts < maxAttempts) {
    attempts++;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.AI_AUTH_KEY}`,
        },
        body: JSON.stringify({
          model: 'auto',
          messages,
          stream: true,
          temperature: options?.temperature ?? 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempts < maxAttempts) {
          await delay(2000);
          continue;
        }
        yield {
          type: 'error' as const,
          statusCode: response.status,
          message: `AI request failed: HTTP ${response.status} ${response.statusText}`,
        };
        return;
      }

      if (!response.body) {
        yield { type: 'error' as const, message: 'No response body' };
        return;
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // skip empty/comment lines

          if (trimmed === 'data: [DONE]') {
            yield { delta: '', done: true };
            return;
          }

          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield { delta: content, done: false };
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      }

      // Stream ended without [DONE] signal
      yield { delta: '', done: true };
      return;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        if (attempts < maxAttempts) {
          await delay(2000);
          continue;
        }
        yield { type: 'error' as const, message: 'AI request timed out after 30 seconds' };
        return;
      }

      if (attempts < maxAttempts) {
        await delay(2000);
        continue;
      }

      yield {
        type: 'error' as const,
        message: `AI request failed: ${error instanceof Error ? error.message : 'Network error'}`,
      };
      return;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a yielded value is an error
 */
export function isAIError(chunk: StreamChunk | AIClientError): chunk is AIClientError {
  return 'type' in chunk && chunk.type === 'error';
}

/**
 * Forward AI stream chunks to a connected side panel port.
 * Sends AI_STREAM_CHUNK messages for each delta and AI_STREAM_DONE on completion.
 * On error, sends AI_STREAM_ERROR.
 */
export async function forwardStreamToPort(
  port: chrome.runtime.Port,
  messages: ChatMessage[],
  requestId: string,
  options?: { temperature?: number }
): Promise<void> {
  for await (const chunk of streamCompletion(messages, options)) {
    if (isAIError(chunk)) {
      port.postMessage({ type: 'AI_STREAM_ERROR', error: chunk.message, requestId });
      return;
    }

    port.postMessage({ type: 'AI_STREAM_CHUNK', chunk, requestId });

    if (chunk.done) {
      port.postMessage({ type: 'AI_STREAM_DONE', requestId });
      return;
    }
  }
}
