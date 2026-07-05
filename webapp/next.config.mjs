import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: rootDir,
  },
  // Drive backend libs are heavy Node packages — leave them as runtime
  // node_modules requires instead of bundling. Also stops Next from trying to
  // resolve @vercel/functions/oidc's optional dynamic import of the AWS SDK
  // (we only use getVercelOidcToken, never the AWS credentials provider).
  serverExternalPackages: ['googleapis', 'google-auth-library', '@vercel/functions'],
  // Product registry moved from /sa to /products. Keep old links working.
  async redirects() {
    return [{ source: '/sa', destination: '/products', permanent: true }];
  },
};

export default nextConfig;
