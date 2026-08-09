import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Funding Bench",
  description: "A benchmark for how well LLMs assess grant proposals and predict follow-up funding",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-mono`}>
        <div className="mx-auto max-w-4xl px-4 py-8">
          <header className="mb-10 border-b-2 border-orange-500 pb-4">
            <Link href="/" className="text-xl font-bold">
              Funding<span className="text-orange-600">Bench</span>
            </Link>
            <nav className="mt-2 flex gap-6 text-sm">
              <Link href="/projects" className="hover:text-orange-600 underline">
                projects
              </Link>
              <Link href="/funders" className="hover:text-orange-600 underline">
                funders
              </Link>
              <Link href="/results" className="hover:text-orange-600 underline">
                results
              </Link>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="mt-16 border-t border-neutral-300 pt-4 text-xs text-neutral-500 dark:border-neutral-700">
            Funding Bench 0 — proposals from{" "}
            <a href="https://manifund.org" className="underline">
              Manifund
            </a>
            ; outcomes hidden from evaluated models.
          </footer>
        </div>
      </body>
    </html>
  );
}
