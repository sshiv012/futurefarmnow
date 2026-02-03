'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

// Dynamic import to avoid SSR issues with Leaflet
const DynamicMap = dynamic(() => import('./LeafletMap'), {
  loading: () => (
    <div className="flex items-center justify-center h-full bg-muted/50">
      <div className="flex items-center space-x-2 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading map...</span>
      </div>
    </div>
  ),
  ssr: false
})

export function MapContainer() {
  return (
    <div className="h-full w-full relative">
      <DynamicMap />
    </div>
  )
}