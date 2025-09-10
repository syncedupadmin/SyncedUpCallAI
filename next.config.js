/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['pg']
  },
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  generateStaticParams: false,
  dynamicParams: true
}

export default nextConfig