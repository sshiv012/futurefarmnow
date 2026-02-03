'use client'

import { useEffect, useRef } from 'react'
import { useURLState } from '@/lib/utils/urlState'
import { useMapStore } from '@/lib/stores/mapStore'

export function useURLSync() {
  const { urlState, updateURLState } = useURLState()

  // Use selectors with shallow equality to prevent unnecessary re-renders
  const currentZoom = useMapStore((state) => state.currentZoom)
  const currentCenter = useMapStore((state) => state.currentCenter)
  const selectedDataset = useMapStore((state) => state.selectedDataset)
  const activeTab = useMapStore((state) => state.activeTab)
  const selectedSoilLayer = useMapStore((state) => state.selectedSoilLayer)
  const selectedSoilDepth = useMapStore((state) => state.selectedSoilDepth)
  const selectedDateRange = useMapStore((state) => state.selectedDateRange)

  const setCurrentZoom = useMapStore((state) => state.setCurrentZoom)
  const setCurrentCenter = useMapStore((state) => state.setCurrentCenter)
  const setSelectedDataset = useMapStore((state) => state.setSelectedDataset)
  const setActiveTab = useMapStore((state) => state.setActiveTab)
  const setSelectedSoilLayer = useMapStore((state) => state.setSelectedSoilLayer)
  const setSelectedSoilDepth = useMapStore((state) => state.setSelectedSoilDepth)
  const setSelectedDateRange = useMapStore((state) => state.setSelectedDateRange)

  const isInitialized = useRef(false)
  const isUpdatingFromStore = useRef(false)
  const lastMapState = useRef<{ center?: [number, number], zoom?: number }>({})
  const lastUrlState = useRef<{ lat?: number, lng?: number, zoom?: number }>({})

  // Return whether initialization is complete
  const initializationComplete = isInitialized.current

  // Initialize state from URL on first load - run immediately
  useEffect(() => {
    if (!isInitialized.current) {
      // Check if we have any URL parameters to apply
      const hasURLParams = urlState.lat !== undefined || urlState.lng !== undefined ||
                           urlState.zoom !== undefined || urlState.dataset ||
                           urlState.activeTab || urlState.soilLayer ||
                           urlState.soilDepth || urlState.dateFrom || urlState.dateTo

      if (hasURLParams) {
        // Set initial state from URL parameters immediately
        if (urlState.lat !== undefined && urlState.lng !== undefined) {
          setCurrentCenter([urlState.lat, urlState.lng])
          lastUrlState.current.lat = urlState.lat
          lastUrlState.current.lng = urlState.lng
        }

        if (urlState.zoom !== undefined) {
          setCurrentZoom(urlState.zoom)
          lastUrlState.current.zoom = urlState.zoom
        }

        if (urlState.dataset) {
          setSelectedDataset(urlState.dataset)
        }

        if (urlState.activeTab) {
          setActiveTab(urlState.activeTab)
        }

        if (urlState.soilLayer) {
          setSelectedSoilLayer(urlState.soilLayer)
        }

        if (urlState.soilDepth) {
          setSelectedSoilDepth(urlState.soilDepth)
        }

        if (urlState.dateFrom && urlState.dateTo) {
          setSelectedDateRange({
            from: urlState.dateFrom,
            to: urlState.dateTo
          })
        }
      }

      // Mark as initialized after first run regardless of whether URL params exist
      isInitialized.current = true
    }
  }, [urlState, setCurrentCenter, setCurrentZoom, setSelectedDataset, setActiveTab, setSelectedSoilLayer, setSelectedSoilDepth, setSelectedDateRange])

  // Sync map position changes to URL with debouncing
  useEffect(() => {
    if (!isInitialized.current) return

    // Skip if center or zoom is undefined
    if (!currentCenter || currentZoom === undefined || currentZoom === null) return

    // Round values for comparison
    const roundedLat = Math.round(currentCenter[0] * 10000) / 10000
    const roundedLng = Math.round(currentCenter[1] * 10000) / 10000
    const roundedZoom = Math.round(currentZoom * 10) / 10

    // Check if values actually changed from last update
    const hasChanged = (
      !lastMapState.current.center ||
      Math.abs((lastMapState.current.center[0] || 0) - roundedLat) > 0.0001 ||
      Math.abs((lastMapState.current.center[1] || 0) - roundedLng) > 0.0001 ||
      Math.abs((lastMapState.current.zoom || 0) - roundedZoom) > 0.01
    )

    if (hasChanged) {
      // Update our record of what we're syncing
      lastMapState.current = { center: [roundedLat, roundedLng], zoom: roundedZoom }

      const mapUrlState: any = {
        lat: roundedLat,
        lng: roundedLng,
        zoom: roundedZoom
      }

      // Update URL with debouncing for map movements
      updateURLState(mapUrlState, { immediate: false })
    }
  }, [currentCenter, currentZoom, updateURLState])

  // Sync non-map store changes to URL immediately
  useEffect(() => {
    if (!isInitialized.current || isUpdatingFromStore.current) return

    isUpdatingFromStore.current = true

    const newUrlState: any = {}

    // Include dataset and active tab
    if (selectedDataset) {
      newUrlState.dataset = selectedDataset
    }

    if (activeTab) {
      newUrlState.activeTab = activeTab
    }

    // Tab-specific parameters
    if (activeTab === 'soil') {
      // Include soil-specific parameters, exclude date parameters
      if (selectedSoilLayer) {
        newUrlState.soilLayer = selectedSoilLayer
      }

      if (selectedSoilDepth) {
        newUrlState.soilDepth = selectedSoilDepth
      }

      // Explicitly remove date parameters by setting to null
      newUrlState.dateFrom = null
      newUrlState.dateTo = null
    } else if (activeTab === 'ndvi') {
      // Include date parameters, exclude soil-specific parameters
      if (selectedDateRange) {
        newUrlState.dateFrom = selectedDateRange.from
        newUrlState.dateTo = selectedDateRange.to
      }

      // Explicitly remove soil parameters by setting to null
      newUrlState.soilLayer = null
      newUrlState.soilDepth = null
    } else if (activeTab === 'sample') {
      // Sample tab might use soil parameters but not dates
      if (selectedSoilLayer) {
        newUrlState.soilLayer = selectedSoilLayer
      }

      if (selectedSoilDepth) {
        newUrlState.soilDepth = selectedSoilDepth
      }

      // Explicitly remove date parameters
      newUrlState.dateFrom = null
      newUrlState.dateTo = null
    }

    // Update URL immediately for non-map changes
    updateURLState(newUrlState, { immediate: true })

    // Reset flag after update
    setTimeout(() => {
      isUpdatingFromStore.current = false
    }, 100)

  }, [
    selectedDataset,
    activeTab,
    selectedSoilLayer,
    selectedSoilDepth,
    selectedDateRange,
    updateURLState
  ])
}