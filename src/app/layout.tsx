import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HYPER_SEND",
  description: "A simple and friendly file sharing service.",
};

import { ThemeProvider } from "@/components/ThemeProvider";
import { headers } from "next/headers";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // CSP nonce from proxy.ts, for the theme script injected by next-themes
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="ko"
      className={`${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground selection:bg-foreground selection:text-background transition-colors duration-300">
        <ThemeProvider nonce={nonce}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
