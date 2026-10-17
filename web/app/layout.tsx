import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dev Playground",
  description: "Local developer playgrounds: Django backend lab and Database & ORM Academy",
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
