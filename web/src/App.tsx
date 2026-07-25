import { useEffect, useState, useCallback } from 'react';
import { fetchHealth, type HealthStatusResponse } from './api/health-client.js';

export function App() {
  const [health, setHealth] = useState<HealthStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(() => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadHealth();
  }, [loadHealth]);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Relay</h1>
      <p>Local task sidecar for human–AI workflows.</p>

      <div
        style={{
          marginTop: '1.5rem',
          padding: '1rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
        }}
      >
        {loading && <p data-testid="status-loading">Checking local service…</p>}
        {!loading && error && (
          <div data-testid="status-error">
            <p style={{ color: 'red' }}>Relay service unavailable</p>
            <button onClick={loadHealth} type="button">
              Retry
            </button>
          </div>
        )}
        {!loading && health && (
          <p data-testid="status-success">Connected (v{health.version})</p>
        )}
      </div>
    </div>
  );
}
