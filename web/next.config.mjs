import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow an isolated build/check without disturbing an already running dev server.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
  distDir: process.env.NEXT_BUILD_DIR || '.next',
};
export default nextConfig;
