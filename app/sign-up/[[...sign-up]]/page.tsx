import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return <section className="auth-page"><div className="auth-intro"><p className="eyebrow">Tripwire workspace</p><h1>Start with<br /><em>the source.</em></h1><p>Create a workspace to review the complete signal queue and its supporting evidence.</p></div><div className="auth-panel"><SignUp /></div></section>;
}
