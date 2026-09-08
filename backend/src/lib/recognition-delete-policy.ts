export const SENT_RECOGNITION_DELETE_WINDOW_MS = 5 * 60 * 1000;

export function sentRecognitionDeleteUntil(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SENT_RECOGNITION_DELETE_WINDOW_MS);
}

export function canDeleteSentRecognition(createdAt: Date, now = new Date()): boolean {
  return now.getTime() <= sentRecognitionDeleteUntil(createdAt).getTime();
}
