/** @type {import('next').NextConfig} */
const nextConfig = {
  // Product registry moved from /sa to /products. Keep old links working.
  async redirects() {
    return [{ source: '/sa', destination: '/products', permanent: true }];
  },
};

export default nextConfig;
