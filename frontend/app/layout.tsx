import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tax LLM",
  description: "Transactional tax agent for planning, structuring, and deal analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
