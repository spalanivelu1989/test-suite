/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright + its browser launch must run in the Node.js runtime, never edge.
  serverExternalPackages: ["playwright", "playwright-core"],
  experimental: {
    outputFileTracingIncludes: {
      '/**/*': ['.claude/agents/**/*'],
    },
  },
};

export default nextConfig;
