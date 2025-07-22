/** @type {import('next').NextConfig} */
const nextConfig = {
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
  webpack: (config) => {
    config.externals = [...config.externals, 'canvas', 'jsdom'];
    return config;
  },
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig