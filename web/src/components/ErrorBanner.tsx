export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <p role="status">
      {message}{' '}
      <button onClick={onRetry} type="button">
        Retry
      </button>
    </p>
  );
}
