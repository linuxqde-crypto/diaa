/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Server-side proxy so the browser always talks same-origin /api → NestJS
    return [{ source: '/backend/:path*', destination: `${process.env.API_INTERNAL_URL ?? 'http://api:3001'}/:path*` }];
  },
};
export default nextConfig;
