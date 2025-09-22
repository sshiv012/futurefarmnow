import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'
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
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isUpdatingRef = useRef(false)

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

  const updateURLState = useCallback((newState: Partial<URLState>, options?: { immediate?: boolean }) => {
    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
      updateTimeoutRef.current = null
    }

    const performUpdate = () => {
      if (isUpdatingRef.current) return

      const currentParams = new URLSearchParams(searchParams.toString())
      let hasChanges = false

      // Round coordinates to reduce precision noise
      const processedState = { ...newState }
      if (processedState.lat !== undefined && processedState.lat !== null) {
        processedState.lat = Math.round(processedState.lat * 10000) / 10000
      }
      if (processedState.lng !== undefined && processedState.lng !== null) {
        processedState.lng = Math.round(processedState.lng * 10000) / 10000
      }
      if (processedState.zoom !== undefined && processedState.zoom !== null) {
        processedState.zoom = Math.round(processedState.zoom * 10) / 10
      }

      // Check if any values actually changed
      Object.entries(processedState).forEach(([key, value]) => {
        const urlKey = key === 'activeTab' ? 'tab' : key
        const currentValue = currentParams.get(urlKey)

        if (value !== undefined && value !== null) {
          const newValue = value.toString()
          if (currentValue !== newValue) {
            currentParams.set(urlKey, newValue)
            hasChanges = true
          }
        } else {
          if (currentParams.has(urlKey)) {
            currentParams.delete(urlKey)
            hasChanges = true
          }
        }
      })

      // Only update URL if something actually changed
      if (!hasChanges) {
        isUpdatingRef.current = false
        return
      }

      isUpdatingRef.current = true
      const newURL = `${window.location.pathname}?${currentParams.toString()}`

      // Use requestIdleCallback for better performance
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
          router.replace(newURL, { scroll: false })
          setTimeout(() => {
            isUpdatingRef.current = false
          }, 50)
        }, { timeout: 100 })
      } else {
        router.replace(newURL, { scroll: false })
        setTimeout(() => {
          isUpdatingRef.current = false
        }, 50)
      }
    }

    // If immediate update requested or not a map movement update, update immediately
    if (options?.immediate || (!('lat' in newState) && !('lng' in newState) && !('zoom' in newState))) {
      performUpdate()
    } else {
      // Debounce map movement updates by 500ms
      updateTimeoutRef.current = setTimeout(performUpdate, 500)
    }
  }, [router, searchParams])

  const clearURLParams = useCallback(() => {
    // Clear any pending updates
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
      updateTimeoutRef.current = null
    }
    router.replace(window.location.pathname, { scroll: false })
  }, [router])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [])

  return {
    urlState: getURLState(),
    updateURLState,
    clearURLParams
  }
}

