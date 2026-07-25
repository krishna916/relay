import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from './App.js';
import * as healthClient from './api/health-client.js';

describe('App component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading, then success state', async () => {
    vi.spyOn(healthClient, 'fetchHealth').mockResolvedValue({
      name: 'relay',
      status: 'ok',
      version: '0.1.0',
    });

    render(<App />);

    expect(screen.getByTestId('status-loading')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeDefined();
    });
    expect(screen.getByText('Connected (v0.1.0)')).toBeDefined();
  });

  it('renders error state and handles retry button click', async () => {
    const fetchSpy = vi
      .spyOn(healthClient, 'fetchHealth')
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce({ name: 'relay', status: 'ok', version: '0.1.0' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('status-error')).toBeDefined();
    });

    const retryBtn = screen.getByText('Retry');
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('status-success')).toBeDefined();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
