'use client';
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="empty" style={{ minHeight: '80vh' }}>
      <h1>A little pause in service.</h1>
      <p>Something unexpected happened. Please try again.</p>
      <button className="btn primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
