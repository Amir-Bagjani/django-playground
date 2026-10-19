import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dev Playground",
  description: "Local developer playgrounds: Django backend lab and Database & ORM Academy",
};

/**
 * Applies the saved theme before first paint so a light-theme visitor never
 * sees a dark flash. Kept in `<head>` as a blocking, dependency-free snippet.
 */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('devplayground-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
