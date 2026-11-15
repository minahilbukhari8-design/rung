/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rung/domain'],
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
  // public listing images and delivery photos are served by the API
  async rewrites() {
    return [{ source: '/files/public/:path*', destination: `${API_URL}/api/v1/files/public/:path*` }];
  },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }];
  },
};
export default nextConfig;
