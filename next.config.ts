import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Node libSQL client (used only for local `file:` DBs) ships a native
  // binary; keep it out of the bundle and load it at runtime instead.
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
