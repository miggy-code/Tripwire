import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider, OrganizationSwitcher, Show, SignInButton, UserButton } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tripwire — public company signals',
  description: 'Reviewable public evidence about company operating changes.',
};

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);

function Header() {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Tripwire home"><span className="wordmark-mark" aria-hidden="true">T</span>Tripwire</a>
      <nav aria-label="Primary navigation" className="site-nav">
        <a href="/">Feed</a>
        <a href="/status">Coverage</a>
        {clerkConfigured ? (
          <div className="account-controls">
            <Show when="signed-in"><OrganizationSwitcher hidePersonal={false} /><UserButton /></Show>
            <Show when="signed-out"><SignInButton><button className="sign-in-button">Sign in</button></SignInButton></Show>
          </div>
        ) : (
          <span className="auth-unavailable" title="Sign-in is not configured for this deployment">Sign-in unavailable</span>
        )}
      </nav>
    </header>
  );
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const content = <><Header /><main>{children}</main><footer><span>Tripwire</span><span>Company signals. Source included.</span></footer></>;
  return (
    <html lang="en">
      <body>{clerkConfigured ? <ClerkProvider>{content}</ClerkProvider> : content}</body>
    </html>
  );
}
