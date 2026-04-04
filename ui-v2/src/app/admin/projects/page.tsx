import {
  removeProjectMemberAction,
} from "@/modules/admin/actions";
import { AddProjectMembersForm } from "@/modules/admin/components/add-project-members-form";
import { AdminShell } from "@/modules/admin/components/admin-shell";
import { CreateProjectForm } from "@/modules/admin/components/create-project-form";
import { getAllUsers } from "@/modules/auth/server/service";
import {
  listProjectMembers,
  listProjectsForUser,
  listUnassignedUsersForProject,
} from "@/modules/projects/server/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function AdminProjectsPage() {
  const users = await getAllUsers();
  const projects = await listProjectsForUser("admin", "admin");
  const projectDetails = await Promise.all(
    projects.map(async (project) => ({
      project,
      members: await listProjectMembers(project.id),
      availableUsers: await listUnassignedUsersForProject(project.id),
    })),
  );

  return (
    <AdminShell
      eyebrow="Administration"
      title="Projects"
      description="Projects are the shared boundary for workflows. Create project spaces, then assign members who can collaboratively create, edit, and run workflows inside them."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── Left sidebar ── */}
        <aside className="flex flex-col gap-4">
          {/* Create project card */}
          <Card className="border-amber-700/18 dark:border-amber-300/10 bg-white/85 dark:bg-stone-950/75 backdrop-blur-sm shadow-sm">
            <CardHeader className="pb-0 pt-5 px-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700/80 dark:text-amber-300/60">
                New
              </p>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Create project
              </h2>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-4">
              <CreateProjectForm />
            </CardContent>
          </Card>

          {/* Platform users stat */}
          <Card className="border-amber-700/18 dark:border-amber-300/10 bg-white/85 dark:bg-stone-950/75 backdrop-blur-sm shadow-sm">
            <CardContent className="px-5 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700/80 dark:text-amber-300/60 mb-3">
                Platform users
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {users.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  {users.length === 1 ? "user" : "users"} available
                </span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                All platform users can be assigned into project spaces below.
              </p>
            </CardContent>
          </Card>
        </aside>

        {/* ── Project list ── */}
        <section className="flex flex-col gap-5">
          {projectDetails.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-700/20 dark:border-amber-300/10 bg-white/60 dark:bg-stone-950/50 py-16 text-center">
              <p className="text-sm font-medium text-muted-foreground">
                No projects yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Create your first project using the panel on the left.
              </p>
            </div>
          )}

          {projectDetails.map(({ project, members, availableUsers }) => (
            <Card
              key={project.id}
              className="border-amber-700/18 dark:border-amber-300/10 bg-white/85 dark:bg-stone-950/75 backdrop-blur-sm shadow-sm overflow-hidden"
            >
              {/* Project header */}
              <CardHeader className="flex flex-row items-center justify-between px-5 py-4 space-y-0">
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    {project.name}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {members.length}{" "}
                    {members.length === 1 ? "member" : "members"}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-[0.22em] border-amber-700/20 dark:border-amber-300/20 bg-amber-500/8 dark:bg-amber-300/7 text-amber-700 dark:text-amber-300/80"
                >
                  Active
                </Badge>
              </CardHeader>

              <Separator className="bg-amber-700/10 dark:bg-amber-300/8" />

              <CardContent className="p-5 space-y-5">
                {/* Members list */}
                {members.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No members assigned yet.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 dark:bg-background/40 px-4 py-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {member.name || member.email}
                          </p>
                          {member.name && (
                            <p className="text-xs text-muted-foreground truncate">
                              {member.email}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-[0.22em] border-amber-700/20 dark:border-amber-300/20 bg-amber-500/8 dark:bg-amber-300/7 text-amber-700 dark:text-amber-300/80"
                          >
                            {member.role}
                          </Badge>
                          <form action={removeProjectMemberAction}>
                            <input
                              type="hidden"
                              name="projectId"
                              value={project.id}
                            />
                            <input
                              type="hidden"
                              name="userId"
                              value={member.id}
                            />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="text-xs text-muted-foreground hover:border-red-400/40 hover:bg-red-500/8 hover:text-red-600 dark:hover:text-red-400"
                            >
                              Remove
                            </Button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add members */}
                {availableUsers.length > 0 && (
                  <AddProjectMembersForm
                    projectId={project.id}
                    availableUsers={availableUsers}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
