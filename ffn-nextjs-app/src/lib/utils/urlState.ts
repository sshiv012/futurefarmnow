import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import { SoilLayerEnum } from '@/lib/types/api'

export interface URLState {
  lat?: number
  lng?: number
  zoom?: number
  dataset?: string
  activeTab?: 'soil' | 'ndvi' | 'sample'
  soilLayer?: SoilLayerEnum
  soilDepth?: string
  dateFrom?: string
  dateTo?: string
}

export function useURLState() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const getURLState = useCallback((): URLState => {
    const params = new URLSearchParams(searchParams.toString())
    
    return {
      lat: params.get('lat') ? parseFloat(params.get('lat')!) : undefined,
      lng: params.get('lng') ? parseFloat(params.get('lng')!) : undefined,
      zoom: params.get('zoom') ? parseInt(params.get('zoom')!) : undefined,
      dataset: params.get('dataset') || undefined,
      activeTab: (params.get('tab') as 'soil' | 'ndvi' | 'sample') || undefined,
      soilLayer: (params.get('soilLayer') as SoilLayerEnum) || undefined,
      soilDepth: params.get('soilDepth') || undefined,
      dateFrom: params.get('dateFrom') || undefined,
      dateTo: params.get('dateTo') || undefined,
    }
  }, [searchParams])

  const updateURLState = useCallback((newState: Partial<URLState>) => {
    const currentParams = new URLSearchParams(searchParams.toString())
    
    // Update or remove parameters
    Object.entries(newState).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Map activeTab to 'tab' in URL
        const urlKey = key === 'activeTab' ? 'tab' : key
        currentParams.set(urlKey, value.toString())
      } else {
        const urlKey = key === 'activeTab' ? 'tab' : key
        currentParams.delete(urlKey)
      }
    })

    // Update the URL without causing a page reload
    const newURL = `${window.location.pathname}?${currentParams.toString()}`
    router.replace(newURL, { scroll: false })
  }, [router, searchParams])

  const clearURLParams = useCallback(() => {
    router.replace(window.location.pathname, { scroll: false })
  }, [router])

  return {
    urlState: getURLState(),
    updateURLState,
    clearURLParams
  }
}

