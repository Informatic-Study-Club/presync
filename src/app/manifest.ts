import type { MetadataRoute } from "next";
import { id as t } from "@/messages/id";

// Manifest PWA: syarat web push di iPhone (Presync harus ditambahkan ke Layar Utama).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t.app.name} ${t.app.org}`,
    short_name: t.app.name,
    description: t.app.description,
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
