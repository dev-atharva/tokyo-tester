import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import { listProjectsForUser } from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return withAgent(request, "read", async (identity) => {
    const projects = await listProjectsForUser(identity.userId);
    return Response.json({
      projects: projects.filter((project) => project.id === identity.projectId),
    });
  });
}
