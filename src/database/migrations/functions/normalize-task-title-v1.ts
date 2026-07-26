// Used by migration 0004. Do not modify; introduce a new version and migration instead.
export function normalizeTaskTitleV1(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
}
