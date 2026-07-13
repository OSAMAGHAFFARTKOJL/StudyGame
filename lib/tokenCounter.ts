// lib/tokenCounter.ts
// This utility helps count and truncate tokens

export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function truncateMessages(messages: any[], maxTokens: number): any[] {
  let totalTokens = 0;
  const truncated: any[] = [];
  
  // Process from newest to oldest (keep recent messages)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = msg.content || '';
    const msgTokens = estimateTokenCount(typeof content === 'string' ? content : JSON.stringify(content));
    
    // Always include system message
    if (msg.role === 'system') {
      truncated.unshift(msg);
      continue;
    }
    
    // Check if adding this message exceeds limit
    if (totalTokens + msgTokens > maxTokens) {
      break; // Stop adding older messages
    }
    
    totalTokens += msgTokens;
    truncated.unshift(msg); // Add to front to maintain chronological order
  }
  
  return truncated;
}

export function getTokenBudget(text: string, maxBudget: number = 6000): number {
  const inputTokens = estimateTokenCount(text);
  const available = maxBudget - inputTokens - 100; // 100 token buffer
  return Math.max(100, Math.min(2000, available));
}