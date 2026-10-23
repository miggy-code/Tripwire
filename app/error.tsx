'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="error-page"><p className="eyebrow">Unable to load</p><h1>The evidence feed is unavailable.</h1><p className="intro-copy">Please try again. No result has been substituted for the unavailable data.</p><button className="action-button" onClick={reset}>Try again</button></section>;
}
