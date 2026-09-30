import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same Wi-Fi load the dev server's scripts
  // via the laptop's LAN IP (Next blocks cross-origin dev resources by
  // default, so the page never hydrates). Update if the LAN IP changes.
  allowedDevOrigins: ["10.201.28.166"],
};

export default nextConfig;
