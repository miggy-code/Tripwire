'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="error-page"><p className="eyebrow">Unable to load</p><h1>The evidence feed is unavailable.</h1><p className="intro-copy">Try again in a moment. If the issue continues, check collection status.</p><button className="action-button" onClick={reset}>Try again</button></section>;
}
