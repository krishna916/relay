import { z } from 'zod';

export const HealthStatusSchema = z.object({
  name: z.literal('relay'),
  status: z.literal('ok'),
  version: z.string(),
});

export type HealthStatusResponse = z.infer<typeof HealthStatusSchema>;

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatusResponse> {
  const init: RequestInit = signal ? { signal } : {};
  const res = await fetch('/api/health', init);
  if (!res.ok) {
    throw new Error(`Health check failed with status ${res.status}`);
  }
  const data = (await res.json()) as unknown;
  const parsed = HealthStatusSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Invalid health check response schema');
  }
  return parsed.data;
}
