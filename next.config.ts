import type { NextConfig } from "next";

/**
 * DEV_ALLOWED_ORIGINS: comma-separated LAN hosts allowed to reach the dev server
 * (e.g. "192.168.1.14,192.168.1.6"). Set it in .env.local; never hard-code addresses here.
 * Entries are strictly validated as hostnames / IPv4 addresses (no ports, schemes or wildcards).
 */
function parseDevOrigins(raw: string | undefined): string[] {
  const hosts = (raw || "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  for (const host of hosts) {
    const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) && host.split(".").every((n) => Number(n) <= 255);
    const isHostname = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(host);
    if (!isIpv4 && !isHostname) {
      throw new Error(`[CONFIG] Invalid DEV_ALLOWED_ORIGINS entry: "${host}"`);
    }
  }
  return hosts;
}

const devHosts = ["localhost", "127.0.0.1", ...parseDevOrigins(process.env.DEV_ALLOWED_ORIGINS)];
const devOrigins = Array.from(new Set(devHosts.flatMap((h) => [h, `${h}:3000`])));

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  experimental: {
    serverActions: {
      allowedOrigins: devOrigins.filter((o) => o.endsWith(":3000")),
    },
  },
};

export default nextConfig;
