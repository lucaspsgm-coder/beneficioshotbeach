import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
