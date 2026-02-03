import { ManifoldDesigner } from '@/components/ManifoldDesigner'

export default function Home() {
  return (
    <div className="w-screen h-screen bg-[#1a1a1a] overflow-hidden">
      <ManifoldDesigner className="w-full h-full" />
    </div>
  )
}
