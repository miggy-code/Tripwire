import { requireWorkspaceSession } from "../../src/auth";
import { getFeed } from "../../src/repository.js";
import Feed from "../components/Feed";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const session = await requireWorkspaceSession();
  const initialFeed = await getFeed(undefined, {
    tenantId: session.tenantId,
    userId: session.userId,
  });
  return <Feed initialFeed={initialFeed} authenticated />;
}
