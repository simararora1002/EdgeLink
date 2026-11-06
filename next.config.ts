import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Node libSQL client (used only for local `file:` DBs) ships a native
  // binary; keep it out of the bundle and load it at runtime instead.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Pin the project root so a stray lockfile in a parent folder isn't
  // mistaken for the workspace root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
