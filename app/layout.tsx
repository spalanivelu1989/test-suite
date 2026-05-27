import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Fira_Code } from "next/font/google";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "AI UI Testing Tool",
  description:
    "Point it at a web app URL. It crawls, generates Playwright tests, runs them, and reports.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${firaCode.variable}`} suppressHydrationWarning>
      <body style={{ margin: 0, minHeight: "100vh" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
