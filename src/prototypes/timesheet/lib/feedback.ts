export type FeedbackStatus = 'open' | 'done';

export interface FeedbackItem {
  id: string;
  content: string;
  createdAt: string;
  status: FeedbackStatus;
}

export function createFeedback(content: string): FeedbackItem {
  return {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: content.trim(),
    createdAt: new Date().toISOString(),
    status: 'open',
  };
}
