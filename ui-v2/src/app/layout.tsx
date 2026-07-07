import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { auth } from "@/auth";
import { AppShell } from "@/modules/auth/components/app-shell";
import { getUserById } from "@/modules/auth/server/service";
import {
  ensurePersonalProject,
  listProjectsForUser,
} from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tokyo Tester",
  description:
    "Its is an end to end testing platform for any kind of application or complex system.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const sessionUser = session?.user?.id
    ? await getUserById(session.user.id)
    : null;

  if (sessionUser) {
    await ensurePersonalProject(sessionUser.id);
  }
  const projects = sessionUser
    ? await listProjectsForUser(sessionUser.id, sessionUser.role)
    : [];

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell
            userId={sessionUser?.id ?? null}
            userName={sessionUser?.name ?? null}
            userEmail={sessionUser?.email ?? null}
            userRole={sessionUser?.role ?? null}
            projects={projects}
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
