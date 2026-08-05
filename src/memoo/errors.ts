export class MemooApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message || `memoo api error: status ${statusCode}`);
    this.name = "MemooApiError";
    this.statusCode = statusCode;
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
