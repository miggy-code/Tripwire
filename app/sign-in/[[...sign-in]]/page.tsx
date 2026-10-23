import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return <section className="auth-page"><div className="auth-intro"><p className="eyebrow">Tripwire workspace</p><h1>Research with<br /><em>the full record.</em></h1><p>Sign in to review the complete signal queue, apply research lenses, and export your work.</p></div><div className="auth-panel"><SignIn /></div></section>;
}
