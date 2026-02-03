import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Manifold PRO 3D Designer',
  description: 'Professional parametric 3D modeler for pots and lamp shades.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
