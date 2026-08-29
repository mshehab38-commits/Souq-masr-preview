import type { NextConfig } from "next";

function hostnameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];

// Local dev/test image fallback (app/api/uploads/local/[...path]) — same
// origin as APP_URL, but next/image still requires it listed explicitly.
const appHostname = hostnameOf(process.env.APP_URL);
if (appHostname) {
  remotePatterns.push({ hostname: appHostname });
}

// Production object storage CDN (Cloudflare R2 or equivalent).
const cdnHostname = hostnameOf(process.env.STORAGE_PUBLIC_CDN_URL);
if (cdnHostname) {
  remotePatterns.push({ hostname: cdnHostname });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: { remotePatterns },
  // Keeps bullmq out of the server webpack bundle — it has an optional,
  // dynamically-required dependency (@valkey/valkey-glide) that isn't
  // installed (we use ioredis), which webpack otherwise reports as a
  // harmless but noisy "module not found" build warning. The
  // @opentelemetry/@prisma-instrumentation packages get the same
  // treatment for the same reason: @sentry/nextjs's Node SDK pulls them
  // in for auto-instrumentation, and they use a dynamic `require()`
  // webpack can't statically analyze ("Critical dependency: the request
  // of a dependency is an expression") — harmless, but noisy without this.
  serverExternalPackages: [
    "bullmq",
    "@opentelemetry/instrumentation",
    "@opentelemetry/instrumentation-http",
    "@prisma/instrumentation",
  ],
};

export default nextConfig;
