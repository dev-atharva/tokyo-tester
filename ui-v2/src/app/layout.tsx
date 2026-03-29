import type { Metadata } from "next";
import { Geist, Geist_Mono, Roboto } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { HomeLayout } from "@/modules/home/layouts/home-layout";
import { SyncProvider } from "@/modules/sync/SyncProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={roboto.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <HomeLayout>
            <SyncProvider
              config={{
                baseUrl:
                  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
                syncInterval: 3000,
                maxBatchSize: 100,
                enabled: true,
                autoStart: true,
              }}
            >
              {children}
            </SyncProvider>
          </HomeLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
