import type { Metadata, Viewport } from "next";
import { OrbitToastProvider } from "@/components/ui/orbit-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Orbit",
    template: "%s | Orbit",
  },
  description: "Your commitments, projects and time in one place.",
  applicationName: "Orbit",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Orbit",
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="orbit">
      <body className="min-h-dvh">
        <OrbitToastProvider>{children}</OrbitToastProvider>
      </body>
    </html>
  );
}
