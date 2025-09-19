/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ['pg']
  },
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://sbvxvheirbjwfbqjreor.supabase.co";
    const supabaseDomain = new URL(supabaseUrl).host;

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'self'",
      // Scripts and styles (Next.js and Tailwind need 'unsafe-inline')
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Fonts/images/media (Storage access)
      `img-src 'self' data: blob: https://${supabaseDomain}`,
      "font-src 'self' data: https://fonts.gstatic.com",
      `media-src 'self' https://${supabaseDomain} https://*.convoso.com`,
      // XHR/fetch/websocket to Supabase - CRITICAL FOR AUTH
      `connect-src 'self' https://${supabaseDomain} wss://${supabaseDomain}`,
      // Workers (if used by app/Next)
      "worker-src 'self' blob:",
      // If you use iframes to display files from Storage
      `frame-src 'self' https://${supabaseDomain}`,
      // Forms (OAuth callbacks submit to your site)
      "form-action 'self'",
      // Upgrade all HTTP to HTTPS
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: csp,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload"
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()"
          },
        ],
      },
    ];
  },
};
export default nextConfig;