import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="empty" style={{ minHeight: '80vh' }}>
      <span className="eyebrow">404 · A WRONG TURN</span>
      <h1>This table isn’t on the floor plan.</h1>
      <p>Let’s get you back to something good.</p>
      <Link href="/" className="btn primary">
        Back to restaurants
      </Link>
    </main>
  );
}
