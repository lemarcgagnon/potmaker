import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', 'three-stdlib'],
}

export default nextConfig
