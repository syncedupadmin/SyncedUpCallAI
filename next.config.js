/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  experimental: {
    serverComponentsExternalPackages: ['pg']
  }
}

export default nextConfig