import { auth } from '@clerk/nextjs/server';
import { getFeed } from '../src/repository.js';
import Feed from './components/Feed';

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let authenticated = false;
  let feed: any;

  if (clerkConfigured) {
    const session = await auth();
    authenticated = Boolean(session.userId);
    if (authenticated) {
      const userId = session.userId ?? undefined;
      const tenantId = session.orgId ? `org:${session.orgId}` : `user:${userId}`;
      feed = await getFeed(undefined, { tenantId, userId });
    }
  }

  if (!feed) feed = await getFeed(undefined, { limit: 20 });

  return (
    <>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow"><span className="signal-dot" aria-hidden="true" />Signal review</p>
        <h1 id="page-title">Public changes.<br />Clear evidence.</h1>
        <p className="intro-copy">Tripwire records public company signals and preserves the source context. It surfaces questions to investigate, never a claim that a company is buying.</p>
      </section>
      <Feed initialFeed={feed} authenticated={authenticated} />
    </>
  );
}
