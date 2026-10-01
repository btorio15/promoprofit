import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi load the dev server's scripts
  // via the laptop's LAN IP (Next blocks cross-origin dev resources by
  // default, so the page never hydrates). Wildcard per segment so it keeps
  // working when the Wi-Fi hands the laptop a new 10.201.x.x address.
  allowedDevOrigins: ["10.201.*.*"],
};

export default nextConfig;
