import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { auth } from "@/auth";
import { AppShell } from "@/modules/auth/components/app-shell";

const roboto = Roboto({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tokyo Tester",
  description:
    "Its is an end to end testing platform for any kind of application or complex system.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AppShell
            userId={session?.user?.id ?? null}
            userName={session?.user?.name ?? null}
            userEmail={session?.user?.email ?? null}
            userRole={session?.user?.role ?? null}
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
