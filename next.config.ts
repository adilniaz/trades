import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  // pdf-parse (pdfjs-dist) loads its worker module via a runtime dynamic
  // import relative to its own package files. Bundling it into the server
  // chunk graph breaks that path ("Setting up fake worker failed: Cannot
  // find module '.../pdf.worker.mjs'") — keep it external so Node resolves
  // it straight from node_modules instead.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
