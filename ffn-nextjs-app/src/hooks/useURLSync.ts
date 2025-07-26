'use client'

import { useEffect, useRef } from 'react'
import { useURLState } from '@/lib/utils/urlState'
import { useMapStore } from '@/lib/stores/mapStore'

export function useURLSync() {
  const { urlState, updateURLState } = useURLState()
  const {
    currentZoom,
    currentCenter,
    selectedDataset,
    activeTab,
    selectedSoilLayer,
    selectedSoilDepth,
    selectedDateRange,
    setCurrentZoom,
    setCurrentCenter,
    setSelectedDataset,
    setActiveTab,
    setSelectedSoilLayer,
    setSelectedSoilDepth,
    setSelectedDateRange,
  } = useMapStore()

  const isInitialized = useRef(false)
  const isUpdatingFromStore = useRef(false)

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
        }
        
        if (urlState.zoom !== undefined) {
          setCurrentZoom(urlState.zoom)
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

  // Sync store changes to URL (avoid infinite loops)
  useEffect(() => {
    if (!isInitialized.current || isUpdatingFromStore.current) return

    isUpdatingFromStore.current = true

    const newUrlState: any = {}

    // Always include map center and zoom
    if (currentCenter) {
      newUrlState.lat = currentCenter[0]
      newUrlState.lng = currentCenter[1]
    }
    
    if (currentZoom !== undefined && currentZoom !== null) {
      newUrlState.zoom = currentZoom
    }

    // Always include dataset and active tab
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

    updateURLState(newUrlState)

    // Reset flag after update
    setTimeout(() => {
      isUpdatingFromStore.current = false
    }, 100)
    
  }, [
    currentCenter,
    currentZoom,
    selectedDataset,
    activeTab,
    selectedSoilLayer,
    selectedSoilDepth,
    selectedDateRange,
    updateURLState
  ])
}