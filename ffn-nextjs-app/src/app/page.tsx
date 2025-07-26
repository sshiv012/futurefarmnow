import { Suspense } from 'react'
import { MainLayout } from '@/components/MainLayout'
import { Loading } from '@/components/common/Loading'

function MainLayoutWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <MainLayout />
    </Suspense>
  )
}

export default function HomePage() {
  return <MainLayoutWithSuspense />
}