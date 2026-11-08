import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit",
    short_name: "Orbit",
    description: "Proactive personal life operating system.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    categories: ["productivity", "lifestyle"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Today",
        short_name: "Today",
        description: "Open today view",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Timeline",
        short_name: "Timeline",
        description: "Open unified timeline",
        url: "/timeline",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Notes",
        short_name: "Notes",
        description: "Capture and review notes",
        url: "/inbox",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Settings",
        short_name: "Settings",
        description: "Manage check-ins and preferences",
        url: "/settings",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
