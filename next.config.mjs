/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright + its browser launch must run in the Node.js runtime, never edge.
  // The OTel/Langfuse tracing stack must stay external too: bundling the
  // instrumentation breaks the module-patching it relies on to trace Anthropic.
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "@opentelemetry/sdk-node",
    "@langfuse/otel",
    "@arizeai/openinference-instrumentation-anthropic",
  ],
};

export default nextConfig;
