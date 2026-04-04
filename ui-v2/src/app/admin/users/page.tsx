import {
  toggleUserActiveAction,
} from "@/modules/admin/actions";
import { AdminShell } from "@/modules/admin/components/admin-shell";
import { CreateUserForm } from "@/modules/admin/components/create-user-form";
import { getAllUsers } from "@/modules/auth/server/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function AdminUsersPage() {
  const users = await getAllUsers();

  return (
    <AdminShell
      eyebrow="Administration"
      title="Users"
      description="Create platform users, review global roles, and activate or deactivate access without introducing a more complex invitation system."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── Create user card ── */}
        <Card className="border-amber-700/18 dark:border-amber-300/10 bg-white/85 dark:bg-stone-950/75 backdrop-blur-sm shadow-sm">
          <CardHeader className="pb-0 pt-5 px-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-700/80 dark:text-amber-300/60">
              New
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Create user
            </h2>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-4">
            <CreateUserForm />
          </CardContent>
        </Card>

        {/* ── Directory card ── */}
        <Card className="border-amber-700/18 dark:border-amber-300/10 bg-white/85 dark:bg-stone-950/75 backdrop-blur-sm shadow-sm overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4 space-y-0">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Directory
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {users.length} {users.length === 1 ? "user" : "users"} total
              </p>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-[0.22em] border-amber-700/20 dark:border-amber-300/20 bg-amber-500/8 dark:bg-amber-300/7 text-amber-700 dark:text-amber-300/80"
            >
              {users.filter((u) => u.isActive).length} active
            </Badge>
          </CardHeader>

          <Separator className="bg-amber-700/10 dark:bg-amber-300/8" />

          <CardContent className="p-5">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  No users yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground/60">
                  Create your first user using the panel on the left.
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                {users.map((user) => (
                  <article
                    key={user.id}
                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 dark:bg-background/40 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {user.name || user.email}
                      </p>
                      {user.name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {/* Role badge */}
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-[0.22em] border-amber-700/20 dark:border-amber-300/20 bg-amber-500/8 dark:bg-amber-300/7 text-amber-700 dark:text-amber-300/80"
                      >
                        {user.role}
                      </Badge>

                      {/* Active status badge */}
                      <Badge
                        variant="outline"
                        className={
                          user.isActive
                            ? "text-[10px] uppercase tracking-[0.22em] border-emerald-600/25 bg-emerald-500/8 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/7 dark:text-emerald-400/80"
                            : "text-[10px] uppercase tracking-[0.22em] border-border text-muted-foreground"
                        }
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>

                      {/* Toggle action */}
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="nextState"
                          value={user.isActive ? "inactive" : "active"}
                        />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          className={
                            user.isActive
                              ? "text-xs text-muted-foreground hover:border-red-400/40 hover:bg-red-500/8 hover:text-red-600 dark:hover:text-red-400"
                              : "text-xs text-muted-foreground hover:border-emerald-500/40 hover:bg-emerald-500/8 hover:text-emerald-700 dark:hover:text-emerald-400"
                          }
                        >
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
