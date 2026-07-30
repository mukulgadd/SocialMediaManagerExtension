import type { PostData, CommentData, ContentItem, Platform, VoiceProfile } from '../shared/types';
import type { ChatMessage } from '../shared/messages';

const PLATFORM_RULES: Record<string, string> = {
  'linkedin': 'LinkedIn conventions: professional tone, short paragraphs (1-2 sentences each), use line breaks for readability. Hashtags optional (max 3). No forced outbound links in the reply body.',
  'x-twitter': 'X/Twitter conventions: maximum 280 characters per reply. Be punchy and direct. No hashtags unless highly relevant. Use threads (separate messages) if the reply needs more space.',
  'youtube': 'YouTube conventions: conversational comment style. Keep it concise (2-3 sentences). Engage with the video content directly.',
  'substack': 'Substack conventions: thoughtful, newsletter-reader tone. Can be longer (3-5 sentences). Reference specific points from the post.',
};

export function buildReplyPrompt(params: {
  post: PostData;
  voiceProfile: VoiceProfile;
  topicKeywords: string[];
  contentLibrary: ContentItem[];
  replyToComment?: CommentData;
  platform: Platform;
}): ChatMessage[] {
  const { post, voiceProfile, topicKeywords, contentLibrary, replyToComment, platform } = params;

  const platformRules = PLATFORM_RULES[platform] || '';
  const isThreading = !!replyToComment;

  // Build system message with Brand Identity → Keywords → Tone → Rules
  let systemContent = '';

  if (voiceProfile.brandIdentity) {
    systemContent += `You are representing a content creator with this background:\n${voiceProfile.brandIdentity}\n\n`;
  }

  if (topicKeywords.length > 0) {
    systemContent += `Their core topics and expertise areas: ${topicKeywords.join(', ')}\n\n`;
  }

  if (voiceProfile.toneStyle) {
    systemContent += `When writing, use this style: ${voiceProfile.toneStyle}\n\n`;
  }

  systemContent += `You are a social media engagement assistant. Generate 1-3 reply suggestions.\nRules:\n`;
  systemContent += `- ${platformRules}\n`;
  systemContent += `- If a content library item is relevant, suggest it naturally (don't force it)\n`;
  systemContent += `- Keep replies authentic — never generic or spammy\n`;
  systemContent += `- Leverage the user's expertise to add genuine value to the conversation\n`;

  if (isThreading) {
    systemContent += `- You're replying to a comment, not the original post. Be conversational with the commenter.\n`;
  }

  systemContent += `\nFormat: Return each reply suggestion separated by "---" on its own line. If suggesting a content library link, add it on a new line starting with "📎 Link:"`;

  // Build user message
  let userContent = `Post by ${post.author.name}${post.author.handle ? ` (${post.author.handle})` : ''}: "${post.content}"`;

  if (isThreading && replyToComment) {
    userContent += `\n\nReplying to comment by ${replyToComment.author}: "${replyToComment.content}"`;
  }

  // Add content library context
  if (contentLibrary.length > 0) {
    userContent += '\n\nContext - My published content (suggest a link ONLY if genuinely relevant):';
    for (const item of contentLibrary.slice(0, 10)) {
      userContent += `\n• ${item.title} — ${item.url} [${item.topicKeywords.join(', ')}]`;
    }
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

export function buildDraftPrompt(params: {
  topic: string;
  voiceProfile: VoiceProfile;
  topicKeywords: string[];
  platform: Platform;
}): ChatMessage[] {
  const { topic, voiceProfile, topicKeywords, platform } = params;

  const platformRules = PLATFORM_RULES[platform] || '';

  let systemContent = '';

  if (voiceProfile.brandIdentity) {
    systemContent += `You are representing a content creator with this background:\n${voiceProfile.brandIdentity}\n\n`;
  }

  if (topicKeywords.length > 0) {
    systemContent += `Their core topics and expertise areas: ${topicKeywords.join(', ')}\n\n`;
  }

  if (voiceProfile.toneStyle) {
    systemContent += `When writing, use this style: ${voiceProfile.toneStyle}\n\n`;
  }

  systemContent += `You are a social media content assistant. Generate a post draft for the user.\nRules:\n`;
  systemContent += `- ${platformRules}\n`;
  systemContent += `- Write as the user, in first person\n`;
  systemContent += `- Be authentic and insightful — avoid generic motivational content\n`;
  systemContent += `- Include a hook in the first line to stop the scroll\n`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `Write a ${platform} post about: ${topic}` },
  ];
}

export function buildSummaryPrompt(params: {
  analyticsData: string;
  platform: Platform;
}): ChatMessage[] {
  const { analyticsData, platform } = params;

  const systemContent = `You are a social media analytics assistant. Summarize the following ${platform} analytics data into a clear, actionable brief. Highlight:\n- Key metrics and trends (use ↑↓ arrows for direction)\n- Notable wins\n- Areas of concern\n- 1-2 suggested actions\n\nKeep it concise (5-8 bullet points max).`;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: `Here is my ${platform} analytics data:\n\n${analyticsData}` },
  ];
}
