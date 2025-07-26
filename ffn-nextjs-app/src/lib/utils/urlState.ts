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

// Helper function to validate and sanitize URL parameters
export function validateURLState(state: URLState): URLState {
  const validated: URLState = {}

  // Validate coordinates
  if (state.lat !== undefined && !isNaN(state.lat) && state.lat >= -90 && state.lat <= 90) {
    validated.lat = Number(state.lat.toFixed(6))
  }
  
  if (state.lng !== undefined && !isNaN(state.lng) && state.lng >= -180 && state.lng <= 180) {
    validated.lng = Number(state.lng.toFixed(6))
  }

  // Validate zoom
  if (state.zoom !== undefined && !isNaN(state.zoom) && state.zoom >= 1 && state.zoom <= 20) {
    validated.zoom = Math.round(state.zoom)
  }

  // Validate dataset
  if (state.dataset && typeof state.dataset === 'string') {
    validated.dataset = state.dataset
  }

  // Validate active tab
  if (state.activeTab && ['soil', 'ndvi', 'sample'].includes(state.activeTab)) {
    validated.activeTab = state.activeTab
  }

  // Validate soil layer
  const validSoilLayers: SoilLayerEnum[] = ['alpha', 'bd', 'clay', 'hb', 'ksat', 'lambda', 'n', 'om', 'ph', 'sand', 'silt', 'theta_r', 'theta_s']
  if (state.soilLayer && validSoilLayers.includes(state.soilLayer)) {
    validated.soilLayer = state.soilLayer
  }

  // Validate soil depth (predefined or custom format like "10-45")
  const validDepths = ['0-5', '5-15', '15-30', '30-60', '60-100', '100-200']
  const customDepthRegex = /^\d+-\d+$/
  
  if (state.soilDepth) {
    if (validDepths.includes(state.soilDepth)) {
      validated.soilDepth = state.soilDepth
    } else if (customDepthRegex.test(state.soilDepth)) {
      // Validate custom depth format and ranges
      const match = state.soilDepth.match(/^(\d+)-(\d+)$/)
      if (match) {
        const start = parseInt(match[1])
        const end = parseInt(match[2])
        // Validate ranges: start 0-200, end 5-200, end > start
        if (start >= 0 && start <= 200 && end >= 5 && end <= 200 && end > start) {
          validated.soilDepth = state.soilDepth
        }
      }
    }
  }

  // Validate dates (basic ISO date format check)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (state.dateFrom && dateRegex.test(state.dateFrom)) {
    validated.dateFrom = state.dateFrom
  }
  
  if (state.dateTo && dateRegex.test(state.dateTo)) {
    validated.dateTo = state.dateTo
  }

  return validated
}