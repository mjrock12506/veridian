/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three.js ships untranspiled ESM modules used by drei; let Next transpile them.
  transpilePackages: ["three"],
};

export default nextConfig;
