import { auth } from "@clerk/nextjs/server";
import { CLERK_SETUP_MESSAGE, configuredClerkKeys, tenantKey } from "./access.js";

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type SessionIdentity = {
  userId: string;
  orgId: string | null;
  tenantId: string;
};

export function requireClerkConfiguration() {
  if (!configuredClerkKeys()) {
    throw new AuthError(503, "auth_not_configured", CLERK_SETUP_MESSAGE);
  }
}

function identityFrom(authState: { userId: string | null; orgId?: string | null }): SessionIdentity {
  const tenantId = tenantKey({ userId: authState.userId, orgId: authState.orgId ?? null });
  if (!authState.userId || !tenantId) {
    throw new AuthError(401, "unauthenticated", "Sign in to access this resource.");
  }
  return { userId: authState.userId, orgId: authState.orgId ?? null, tenantId };
}

/** Server-side session verification for route handlers and data access. */
export async function requireSession(): Promise<SessionIdentity> {
  requireClerkConfiguration();
  try {
    return identityFrom(await auth());
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, "unauthenticated", "Sign in to access this resource.");
  }
}

/** Server Component helper that sends unauthenticated visitors to Clerk's sign-in flow. */
export async function requireWorkspaceSession(): Promise<SessionIdentity> {
  requireClerkConfiguration();
  const authState = await auth();
  if (!authState.userId) {
    return authState.redirectToSignIn({ returnBackUrl: "/workspace" }) as never;
  }
  return identityFrom(authState);
}
