import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AdminShell } from "@/modules/admin/components/admin-shell";
import {
  addTeamMembersAction,
  removeTeamMemberAction,
  updateTeamMemberRoleAction,
} from "@/modules/projects/actions";
import {
  getProject,
  listProjectMembers,
  listUnassignedUsersForProject,
  userHasProjectPermission,
} from "@/modules/projects/server/service";

export default async function TeamMembersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const canManage = await userHasProjectPermission(
    session.user.id,
    projectId,
    "manage",
    session.user.role,
  );
  const project = await getProject(projectId);
  if (!canManage || !project || project.kind !== "team") redirect("/workflow");
  const [members, availableUsers] = await Promise.all([
    listProjectMembers(projectId),
    listUnassignedUsersForProject(projectId),
  ]);
  const ownerCount = members.filter(
    (member) => member.projectRole === "owner",
  ).length;

  return (
    <AdminShell
      eyebrow="Team workspace"
      title={`${project.name} members`}
      description="Owners manage membership. Editors can change and run workflows; runners can inspect and execute them."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Current members</h2>
          </CardHeader>
          <CardContent className="grid gap-3">
            {members.map((member) => {
              const isFinalOwner =
                member.projectRole === "owner" && ownerCount === 1;
              return (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.name || member.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.role === "admin" ? (
                      <Badge variant="outline">Platform admin</Badge>
                    ) : null}
                    <form
                      action={updateTeamMemberRoleAction}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="userId" value={member.id} />
                      <select
                        name="projectRole"
                        defaultValue={member.projectRole}
                        disabled={isFinalOwner}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="owner">Owner</option>
                        <option value="editor">Editor</option>
                        <option value="runner">Runner</option>
                      </select>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={isFinalOwner}
                      >
                        Save
                      </Button>
                    </form>
                    <form action={removeTeamMemberAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="userId" value={member.id} />
                      <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        disabled={isFinalOwner}
                      >
                        Remove
                      </Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Add runners</h2>
            <p className="text-xs text-muted-foreground">
              New members start with run-only access.
            </p>
          </CardHeader>
          <CardContent>
            <form action={addTeamMembersAction} className="grid gap-4">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="grid max-h-80 gap-2 overflow-y-auto">
                {availableUsers.map((user) => (
                  <label
                    key={user.id}
                    className="flex items-center gap-2 rounded-md border p-2 text-xs"
                  >
                    <input type="checkbox" name="userIds" value={user.id} />
                    <span className="min-w-0 truncate">
                      {user.name || user.email}
                    </span>
                  </label>
                ))}
                {availableUsers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Everyone is already a member.
                  </p>
                ) : null}
              </div>
              <Button type="submit" disabled={availableUsers.length === 0}>
                Add selected
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
