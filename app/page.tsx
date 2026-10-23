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
        <p className="eyebrow"><span className="signal-dot" aria-hidden="true" />Live signal ledger</p>
        <h1 id="page-title">Company signals.<br /><em>A clearer next move.</em></h1>
        <p className="intro-copy">Tripwire monitors public company activity, keeps the original source attached, and turns it into a reviewable research queue.</p>
      </section>
      <Feed initialFeed={feed} authenticated={authenticated} />
    </>
  );
}
