import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Django Playground",
  description: "Local Django lab: edit, run and test code",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
