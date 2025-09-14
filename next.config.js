/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ['pg']
  }
};
export default nextConfig;