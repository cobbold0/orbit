import type { Metadata, Viewport } from "next";
import NextTopLoader from "nextjs-toploader";
import { OrbitToastProvider } from "@/components/ui/orbit-toast";
import { ServiceWorkerRegistrar } from "@/components/shell/service-worker-registrar";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Orbit",
    template: "%s | Orbit",
  },
  description: "Your commitments, projects and time in one place.",
  applicationName: "Orbit",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Orbit",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
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
        <NextTopLoader
          color="#14171c"
          initialPosition={0.15}
          crawlSpeed={150}
          height={2.5}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
        />
        <OrbitToastProvider>
          <ServiceWorkerRegistrar />
          {children}
        </OrbitToastProvider>
      </body>
    </html>
  );
}
