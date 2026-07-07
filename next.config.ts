import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "preview-chat-a7fe34e8-1d80-4f44-9937-cb6ef0af0d55.space-z.ai",
  ],
};

export default nextConfig;
