/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  swcMinify: true,
  compress: true,
  images: {
    domains: [
      'tile.openstreetmap.org',
      'a.tile.openstreetmap.org',
      'b.tile.openstreetmap.org',
      'c.tile.openstreetmap.org',
      'a.basemaps.cartocdn.com',
      'b.basemaps.cartocdn.com',
      'c.basemaps.cartocdn.com',
      'd.basemaps.cartocdn.com',
      'raptor.cs.ucr.edu'
    ],
    unoptimized: true
  },
  // Webpack optimizations
  webpack: (config, { isServer, dev }) => {
    config.externals = [...config.externals, 'canvas', 'jsdom'];

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
              reuseExistingChunk: true,
            },
            // Separate chunk for leaflet 
            leaflet: {
              name: 'leaflet',
              test: /[\\/]node_modules[\\/](leaflet|react-leaflet|leaflet-draw)[\\/]/,
              chunks: 'all',
              priority: 30,
              reuseExistingChunk: true,
            },
            // Separate chunk for recharts
            recharts: {
              name: 'recharts',
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              chunks: 'all',
              priority: 30,
              reuseExistingChunk: true,
            },
            // Common chunk for shared code
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-progress',
      '@radix-ui/react-slider',
      '@tanstack/react-query',
    ],
  },
}

module.exports = nextConfig