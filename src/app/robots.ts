import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Disallows exactly the routes that already require a session — telling
// crawlers not to waste budget on pages they can't index anyway, with no
// new authorization logic. Mirrors the private-route surface documented
// across src/app/{admin,dashboard,profile,orders,favorites,saved-searches}.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api",
        "/dashboard",
        "/profile",
        "/orders",
        "/favorites",
        "/saved-searches",
        "/listings/*/edit",
        "/listings/*/checkout",
        "/listings/mine",
      ],
    },
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
