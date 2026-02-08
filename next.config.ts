import type { NextConfig } from "next";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig: NextConfig = {
  // Prevent Next from picking an incorrect workspace root when other lockfiles
  // exist elsewhere on the machine (common in take-home environments).
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
