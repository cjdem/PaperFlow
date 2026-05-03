'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1rem' }}>
      <p>出错了</p>
      <button onClick={reset} style={{ padding: '0.5rem 1rem', border: '1px solid #ccc', borderRadius: '0.25rem', cursor: 'pointer' }}>
        重试
      </button>
    </div>
  );
}
