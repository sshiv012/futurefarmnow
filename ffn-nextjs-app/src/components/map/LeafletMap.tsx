'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { useMapStore } from '@/lib/stores/mapStore'
import { useTheme } from '@/lib/contexts/ThemeContext'
import { toast } from '@/lib/utils/toast'
import { valueToGrayscale, ndviToColor } from '@/lib/utils/color'

// Fix for default markers in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

export default function LeafletMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const drawControlRef = useRef<L.Control.Draw | null>(null)
  const vectorLayerRef = useRef<L.GeoJSON | null>(null)
  const vectorTileLayerRef = useRef<L.TileLayer | null>(null)
  const soilImageOverlayRef = useRef<L.ImageOverlay | null>(null)
  const ndviImageOverlayRef = useRef<L.ImageOverlay | null>(null)
  const farmlandLayerRef = useRef<L.GeoJSON | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const isUpdatingFromURL = useRef(false)
  const hasCheckedURLCoordinates = useRef(false)
  const userMarkerTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const urlUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const mapUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const {
    selectedDataset,
    currentBounds,
    currentCenter,
    currentZoom,
    drawnPolygon,
    soilImageUrl,
    soilImageBounds,
    ndviImageUrl,
    ndviImageBounds,
    farmlandGeoJSON,
    setCurrentBounds,
    setDrawnPolygon,
    addDrawnPolygon,
    setDrawnPolygons,
    setCurrentZoom,
    setCurrentCenter,
    setMapInstance,
    setDrawnItems
  } = useMapStore()

  const { resolvedTheme } = useTheme()
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Function to pan to user's location
  const panToUserLocation = () => {
    if (!mapInstanceRef.current) return

    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      setLocationError('Geolocation not supported')
      return
    }

    // Show loading toast
    const loadingToast = toast.loading('Getting your location...')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords

        // Pan and zoom to user's location
        mapInstanceRef.current?.setView([latitude, longitude], 15)

        // Add a temporary marker at user's location
        const userMarker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: 'user-location-marker',
            html: `<div style="
              width: 20px;
              height: 20px;
              background-color: #3b82f6;
              border: 3px solid white;
              border-radius: 50%;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
              position: relative;
            ">
              <div style="
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                border: 2px solid #3b82f6;
                border-radius: 50%;
                opacity: 0;
                animation: pulse 2s ease-out infinite;
              "></div>
            </div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(mapInstanceRef.current!)

        // Add pulse animation CSS if not already added
        if (!document.getElementById('location-pulse-style')) {
          const style = document.createElement('style')
          style.id = 'location-pulse-style'
          style.textContent = `
            @keyframes pulse {
              0% {
                opacity: 0.8;
                transform: translate(-50%, -50%) scale(1);
              }
              100% {
                opacity: 0;
                transform: translate(-50%, -50%) scale(2);
              }
            }
          `
          document.head.appendChild(style)
        }

        // Remove marker after 5 seconds
        userMarkerTimeoutRef.current = setTimeout(() => {
          if (mapInstanceRef.current) {
            mapInstanceRef.current.removeLayer(userMarker)
          }
        }, 5000)

        // Dismiss loading and show success
        toast.dismiss(loadingToast)
        toast.success('Moved to your location')
        setLocationError(null)
      },
      (error) => {
        toast.dismiss(loadingToast)

        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error('Location access denied. Please enable location permissions.')
            setLocationError('Permission denied')
            break
          case error.POSITION_UNAVAILABLE:
            toast.error('Unable to retrieve your location')
            setLocationError('Position unavailable')
            break
          case error.TIMEOUT:
            toast.error('Location request timed out')
            setLocationError('Request timeout')
            break
          default:
            toast.error('An error occurred while getting your location')
            setLocationError('Unknown error')
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Initialize map centered on California
    const map = L.map(mapRef.current, {
      center: [36.7783, -119.4179], // California coordinates
      zoom: 6,
      minZoom: 3, // Prevent zooming out too far for better UX
      zoomControl: true,
    })


    // Initialize with light theme tiles
    const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    tileLayerRef.current = tileLayer

    // Initialize feature group for drawn items
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Store references in the map store
    setMapInstance(map)
    setDrawnItems(drawnItems)

    // Initialize drawing controls
    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          showArea: true,
          showLength: true,
          shapeOptions: {
            color: '#3b82f6',
            weight: 2,
            opacity: 1,
            fillColor: '#3b82f6',
            fillOpacity: 0 // Make fill transparent during drawing
          }
        },
        rectangle: {
          shapeOptions: {
            color: '#3b82f6',
            weight: 2,
            opacity: 1,
            fillColor: '#3b82f6',
            fillOpacity: 0 // Make fill transparent during drawing
          }
        },
        circle: false,
        marker: false,
        polyline: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    })
    map.addControl(drawControl)
    drawControlRef.current = drawControl

    // Handle drawing events
    map.on('draw:created', (event: any) => {
      const layer = event.layer

      // Style the layer to have transparent fill with visible border
      layer.setStyle({
        color: '#3b82f6',
        weight: 2,
        opacity: 1,
        fillColor: '#3b82f6',
        fillOpacity: 0 // Make fill transparent
      })

      drawnItems.addLayer(layer)

      // Convert to GeoJSON and store in state
      const geoJSON = layer.toGeoJSON()
      // Add to polygon array instead of replacing
      addDrawnPolygon(geoJSON.geometry)

      toast.success('Polygon drawn successfully')
    })

    map.on('draw:deleted', (event: any) => {
      // Clear all drawn items
      drawnItems.clearLayers()
      setDrawnPolygon(null)
      setDrawnPolygons([])
      toast.success('Area cleared! You can draw a new area now.')
    })

    map.on('draw:edited', (event: any) => {
      const layers = event.layers
      layers.eachLayer((layer: any) => {
        // Apply transparent style to edited layers
        layer.setStyle({
          color: '#3b82f6',
          weight: 2,
          opacity: 1,
          fillColor: '#3b82f6',
          fillOpacity: 0 // Keep fill transparent after editing
        })

        const geoJSON = layer.toGeoJSON()
        setDrawnPolygon(geoJSON.geometry)
      })
      toast.success('Area updated successfully!')
    })

    map.on('draw:deletestart', () => {
      toast.info('Click on the area you want to remove, then click Save to confirm.')
    })

    map.on('draw:editstart', () => {
      toast.info('Drag the corners to adjust your area, then click Save to confirm.')
    })

    // Handle map movement to update bounds, zoom, and center
    // Use a debounced approach to avoid excessive state updates during zoom/pan
    map.on('moveend zoomend', () => {
      // Don't update store if we're in the middle of applying URL state
      if (isUpdatingFromURL.current) {
        return
      }

      // Clear any pending updates
      if (mapUpdateTimeoutRef.current) {
        clearTimeout(mapUpdateTimeoutRef.current)
      }

      // Debounce state updates to improve performance
      mapUpdateTimeoutRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        const center = map.getCenter()
        const zoom = map.getZoom()

        // Batch all state updates together to minimize re-renders
        const newBounds = {
          minx: bounds.getWest(),
          miny: bounds.getSouth(),
          maxx: bounds.getEast(),
          maxy: bounds.getNorth(),
        }

        // Only update if values have actually changed (avoid unnecessary re-renders)
        // We need to get current values from the store at the time of execution
        const currentZoomValue = useMapStore.getState().currentZoom
        const currentCenterValue = useMapStore.getState().currentCenter
        const currentBoundsValue = useMapStore.getState().currentBounds

        if (
          zoom !== currentZoomValue ||
          Math.abs(center.lat - (currentCenterValue?.[0] || 0)) > 0.0001 ||
          Math.abs(center.lng - (currentCenterValue?.[1] || 0)) > 0.0001 ||
          !currentBoundsValue ||
          Math.abs(newBounds.minx - currentBoundsValue.minx) > 0.0001
        ) {
          setCurrentBounds(newBounds)
          setCurrentZoom(zoom)
          setCurrentCenter([center.lat, center.lng])
        }
      }, 100) // 100ms debounce
    })

    mapInstanceRef.current = map

    // Cleanup
    return () => {
      // Clear timeouts
      if (userMarkerTimeoutRef.current) {
        clearTimeout(userMarkerTimeoutRef.current)
        userMarkerTimeoutRef.current = null
      }

      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
        urlUpdateTimeoutRef.current = null
      }

      if (mapUpdateTimeoutRef.current) {
        clearTimeout(mapUpdateTimeoutRef.current)
        mapUpdateTimeoutRef.current = null
      }

      // Remove style element if it exists
      const styleElement = document.getElementById('location-pulse-style')
      if (styleElement) {
        styleElement.remove()
      }

      if (mapInstanceRef.current) {
        // Remove all event listeners
        mapInstanceRef.current.off()

        // Clean up draw control
        if (drawControlRef.current) {
          mapInstanceRef.current.removeControl(drawControlRef.current)
          drawControlRef.current = null
        }

        // Clean up all layer references
        if (vectorTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(vectorTileLayerRef.current)
          vectorTileLayerRef.current = null
        }

        if (tileLayerRef.current) {
          mapInstanceRef.current.removeLayer(tileLayerRef.current)
          tileLayerRef.current = null
        }

        if (soilImageOverlayRef.current) {
          mapInstanceRef.current.removeLayer(soilImageOverlayRef.current)
          soilImageOverlayRef.current = null
        }

        if (farmlandLayerRef.current) {
          mapInstanceRef.current.removeLayer(farmlandLayerRef.current)
          farmlandLayerRef.current = null
        }

        if (vectorLayerRef.current) {
          mapInstanceRef.current.removeLayer(vectorLayerRef.current)
          vectorLayerRef.current = null
        }

        if (drawnItemsRef.current) {
          drawnItemsRef.current.clearLayers()
          mapInstanceRef.current.removeLayer(drawnItemsRef.current)
          drawnItemsRef.current = null
        }

        // Clear store references
        setMapInstance(null)
        setDrawnItems(null)

        // Remove the map instance
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [setCurrentBounds, setCurrentZoom, setCurrentCenter, setDrawnPolygon, addDrawnPolygon, setDrawnPolygons, setMapInstance, setDrawnItems])

  // Sync map position with URL state (only when currentCenter or currentZoom changes from URL)
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Handle center and zoom updates separately
    const mapCenter = mapInstanceRef.current.getCenter()
    const mapZoom = mapInstanceRef.current.getZoom()

    // Check what needs to be updated
    const centerChanged = currentCenter && (Math.abs(mapCenter.lat - currentCenter[0]) > 0.00001 ||
      Math.abs(mapCenter.lng - currentCenter[1]) > 0.00001)
    const zoomChanged = currentZoom !== undefined && currentZoom !== null &&
      Math.abs(mapZoom - currentZoom) > 0.1

    if (centerChanged || zoomChanged) {
      // Use URL values if available, otherwise keep current map values
      const targetCenter = currentCenter || [mapCenter.lat, mapCenter.lng]
      const targetZoom = currentZoom !== undefined && currentZoom !== null ? currentZoom : mapZoom

      isUpdatingFromURL.current = true
      mapInstanceRef.current.setView(targetCenter, targetZoom)

      // Clear any existing timeout
      if (urlUpdateTimeoutRef.current) {
        clearTimeout(urlUpdateTimeoutRef.current)
      }

      urlUpdateTimeoutRef.current = setTimeout(() => {
        isUpdatingFromURL.current = false
      }, 100)
    }
  }, [currentCenter, currentZoom])

  // Update tile layer when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return

    // Remove current tile layer
    mapInstanceRef.current.removeLayer(tileLayerRef.current)

    // Create new tile layer based on theme
    let newTileLayer: L.TileLayer

    if (resolvedTheme === 'dark') {
      // Use CartoDB Dark Matter tiles for dark theme
      newTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CartoDB',
        maxZoom: 19,
        subdomains: 'abcd'
      })
    } else {
      // Use standard OpenStreetMap for light theme
      newTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      })
    }

    // Add new tile layer to map
    newTileLayer.addTo(mapInstanceRef.current)
    tileLayerRef.current = newTileLayer

    // Re-add vector tile layer if one is selected (preserve data layers)
    if (vectorTileLayerRef.current && selectedDataset) {
      // Ensure vector tiles are above base map
      vectorTileLayerRef.current.bringToFront()
    }

    // Cleanup function for this effect
    return () => {
      if (newTileLayer && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(newTileLayer)
        } catch (e) {
          // Layer might already be removed, ignore error
        }
      }
    }
  }, [resolvedTheme, selectedDataset])

  // Update vector tile layer when dataset changes
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Remove existing vector tile layer
    if (vectorTileLayerRef.current) {
      mapInstanceRef.current.removeLayer(vectorTileLayerRef.current)
      vectorTileLayerRef.current = null
    }

    // Add new vector tile layer if dataset is selected
    if (selectedDataset) {
      const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://raptor.cs.ucr.edu/futurefarmnow-backend-0.3-RC1'
      const tileUrl = `${baseURL}/vectors/${selectedDataset}/tile-{z}-{x}-{y}.png`

      const vectorTileLayer = L.tileLayer(tileUrl, {
        maxZoom: 19,
        minZoom: 1,
        opacity: 0.7,
        attribution: 'FutureFarmNow'
      })

      vectorTileLayer.addTo(mapInstanceRef.current)
      vectorTileLayerRef.current = vectorTileLayer

      // Only show toast and center map if not initial load
      if (!isInitialLoad) {
        // Check if we should center map (only if no URL coordinates were ever provided)
        if (!hasCheckedURLCoordinates.current) {
          hasCheckedURLCoordinates.current = true
          // Check current store state for URL coordinates
          if (!currentCenter && !currentZoom) {
            if (selectedDataset === 'farmland') {
              mapInstanceRef.current.setView([36.7783, -119.4179], 6)
            } else if (selectedDataset === 'AZ_Farmland') {
              mapInstanceRef.current.setView([34.0489, -111.0937], 6)
            }
          }
        }

        // Always show toast when dataset changes (but not on zoom changes)
        if (selectedDataset === 'farmland') {
          toast.success('Loaded California farmland dataset')
        } else if (selectedDataset === 'AZ_Farmland') {
          toast.success('Loaded Arizona farmland dataset')
        }
      } else {
        // On initial load, check URL coordinates once
        hasCheckedURLCoordinates.current = true
        if (!currentCenter && !currentZoom) {
          if (selectedDataset === 'farmland') {
            mapInstanceRef.current.setView([36.7783, -119.4179], 6)
          } else if (selectedDataset === 'AZ_Farmland') {
            mapInstanceRef.current.setView([34.0489, -111.0937], 6)
          }
        }
        setIsInitialLoad(false)
      }
    }

    // Cleanup function
    return () => {
      if (vectorTileLayerRef.current && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(vectorTileLayerRef.current)
        } catch (e) {
          // Layer might already be removed, ignore error
        }
      }
    }
  }, [selectedDataset, isInitialLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle soil image overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Store reference to current overlay for cleanup
    const currentOverlay = soilImageOverlayRef.current

    // Remove existing overlay
    if (currentOverlay) {
      mapInstanceRef.current.removeLayer(currentOverlay)
      soilImageOverlayRef.current = null
    }

    // Show/hide drawn items based on soil image presence
    if (drawnItemsRef.current) {
      drawnItemsRef.current.eachLayer((layer: any) => {
        if (soilImageUrl && soilImageBounds) {
          // Hide drawn items when soil image is active to avoid blue overlay
          layer.setStyle({
            opacity: 0,
            fillOpacity: 0,
            color: 'transparent'
          })
        } else {
          // Show drawn items with transparent fill when no soil image
          layer.setStyle({
            opacity: 1,
            fillOpacity: 0,
            color: '#3b82f6',
            weight: 2
          })
        }
      })
    }

    // Add new overlay if image and bounds are available
    let newOverlay: L.ImageOverlay | null = null
    if (soilImageUrl && soilImageBounds) {
      newOverlay = L.imageOverlay(soilImageUrl, soilImageBounds, {
        opacity: 1.0,
        className: 'soil-image-overlay'
      })

      newOverlay.addTo(mapInstanceRef.current)
      soilImageOverlayRef.current = newOverlay

      // Bring overlay to front
      newOverlay.bringToFront()
    }

    // Cleanup function
    return () => {
      if (newOverlay && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(newOverlay)
        } catch (e) {
          // Layer might already be removed, ignore error
        }
      }
    }
  }, [soilImageUrl, soilImageBounds])

  // Handle NDVI image overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Store reference to current overlay for cleanup
    const currentOverlay = ndviImageOverlayRef.current

    // Remove existing overlay
    if (currentOverlay) {
      mapInstanceRef.current.removeLayer(currentOverlay)
      ndviImageOverlayRef.current = null
    }

    // Show/hide drawn items based on NDVI image presence
    if (drawnItemsRef.current) {
      drawnItemsRef.current.eachLayer((layer: any) => {
        if (ndviImageUrl && ndviImageBounds) {
          // Hide drawn items when NDVI image is active to avoid blue overlay
          layer.setStyle({
            opacity: 0,
            fillOpacity: 0,
            color: 'transparent'
          })
        } else if (!soilImageUrl) {
          // Show drawn items with transparent fill when no NDVI or soil image
          layer.setStyle({
            opacity: 1,
            fillOpacity: 0,
            color: '#3b82f6',
            weight: 2
          })
        }
      })
    }

    // Add new overlay if image and bounds are available
    let newOverlay: L.ImageOverlay | null = null
    if (ndviImageUrl && ndviImageBounds) {
      newOverlay = L.imageOverlay(ndviImageUrl, ndviImageBounds, {
        opacity: 1.0,
        className: 'ndvi-image-overlay'
      })

      newOverlay.addTo(mapInstanceRef.current)
      ndviImageOverlayRef.current = newOverlay

      // Bring overlay to front
      newOverlay.bringToFront()
    }

    // Cleanup function
    return () => {
      if (newOverlay && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.removeLayer(newOverlay)
        } catch (e) {
          // Layer might already be removed, ignore error
        }
      }
    }
  }, [ndviImageUrl, ndviImageBounds, soilImageUrl])

  // Handle farmland GeoJSON overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Store reference to current layer for cleanup
    const currentFarmlandLayer = farmlandLayerRef.current

    // Remove existing farmland layer
    if (currentFarmlandLayer) {
      mapInstanceRef.current.removeLayer(currentFarmlandLayer)
      farmlandLayerRef.current = null
    }

    // Add new farmland layer if GeoJSON is available
    if (farmlandGeoJSON) {
      const geoJSONData = farmlandGeoJSON.geoJSON || farmlandGeoJSON
      const colorData = farmlandGeoJSON.colorData
      const ndviData = farmlandGeoJSON.ndviData // NDVI time series data

      // Create a map of farmland IDs to their values and NDVI data
      const farmlandValueMap = new Map()
      
      // Process NDVI data if available
      if (ndviData && Array.isArray(ndviData)) {
        ndviData.forEach((farmland: any) => {
          if (farmland.objectid && farmland.results) {
            // Store NDVI time series data
            farmlandValueMap.set(`ndvi_${farmland.objectid}`, farmland.results)
            farmlandValueMap.set(`stats_${farmland.objectid}`, {
              ...farmland,
              type: 'ndvi',
              dataCount: farmland.results.length
            })
          }
        })
      }
      
      // Process soil color data if available  
      if (colorData && colorData.farmlands) {

        colorData.farmlands.forEach((farmland: any, index: number) => {
          // Try different ways to get the farmland ID - prioritize objectid since that's what we're seeing
          const possibleIds = [
            farmland.objectid,
            farmland.OBJECTID,
            farmland.id,
            farmland.fid,
            farmland.FID,
            farmland.ID,
            farmland.properties?.objectid,
            farmland.properties?.OBJECTID,
            farmland.properties?.id,
            farmland.properties?.fid,
            farmland.properties?.FID,
            farmland.properties?.ID,
            index // Use array index as fallback
          ].filter(id => id !== undefined && id !== null)

          const value = farmland.average ?? farmland.mean ?? farmland.results?.mean ?? farmland.results?.average


          if (possibleIds.length > 0 && value !== undefined) {
            // Map all possible IDs to the same value, and also store the full farmland data
            possibleIds.forEach(id => {
              farmlandValueMap.set(id.toString(), value)
              // Also store the full farmland stats for popup display
              farmlandValueMap.set(`stats_${id}`, farmland)
            })
          }
        })

      }

      const farmlandLayer = L.geoJSON(geoJSONData, {
        style: (feature) => {
          // Default style
          let fillColor = '#3b82f6'
          let fillOpacity = 0.1

          // Check for NDVI data first, then fallback to soil color data
          let value
          let matchedId
          let isNDVIData = false

          if (feature?.properties) {
            // Try multiple ID fields - prioritize objectid since that's what we're seeing in data
            const possibleFeatureIds = [
              feature.properties.objectid,
              feature.properties.OBJECTID,
              feature.properties.id,
              feature.properties.fid,
              feature.properties.ID,
              feature.properties.FID,
              feature.id // GeoJSON feature ID
            ].filter(id => id !== undefined && id !== null)

            // First try to find NDVI data
            if (ndviData && Array.isArray(ndviData)) {
              for (const id of possibleFeatureIds) {
                const ndviTimeSeries = farmlandValueMap.get(`ndvi_${id}`)
                if (ndviTimeSeries && Array.isArray(ndviTimeSeries)) {
                  // Calculate mean NDVI from time series
                  const validValues = ndviTimeSeries
                    .map(point => point.mean)
                    .filter(val => val !== undefined && val !== null && !isNaN(val))
                  
                  if (validValues.length > 0) {
                    value = validValues.reduce((sum, val) => sum + val, 0) / validValues.length
                    matchedId = id
                    isNDVIData = true
                    break
                  }
                }
              }
            }

            // If no NDVI data found, try soil color data
            if (!isNDVIData && colorData) {
              // Try to find a matching soil value using the same ID fields
              for (const id of possibleFeatureIds) {
                const soilValue = farmlandValueMap.get(id.toString())
                if (soilValue !== undefined) {
                  value = soilValue
                  matchedId = id
                  break
                }
              }
            }


            // Apply coloring based on data type
            if (value !== undefined) {
              if (isNDVIData) {
                // NDVI color scheme: Red (poor) -> Yellow (moderate) -> Green (excellent)
                fillColor = ndviToColor(value)
                fillOpacity = 0.7
              } else if (colorData && colorData.min !== undefined && colorData.max !== undefined) {
                // Soil data color scheme: grayscale
                fillColor = valueToGrayscale(value, colorData.min, colorData.max)
                fillOpacity = 0.7 // Higher opacity for colored farmlands
              }
            }
          }

          return {
            color: '#666', // Darker border for contrast
            weight: 1.5,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: fillOpacity
          }
        },
        onEachFeature: (feature, layer) => {
          // Add popup with farmland info if available
          if (feature.properties) {
            // Find matching farmland stats
            const possibleFeatureIds = [
              feature.properties.objectid,
              feature.properties.OBJECTID,
              feature.properties.id,
              feature.properties.fid,
              feature.properties.ID,
              feature.properties.FID,
              feature.id
            ].filter(id => id !== undefined && id !== null)

            let farmlandStats
            let matchedId

            // Try to find matching stats
            for (const id of possibleFeatureIds) {
              farmlandStats = farmlandValueMap.get(`stats_${id}`)
              if (farmlandStats) {
                matchedId = id
                break
              }
            }

            let popupContent = '<div style="min-width: 200px;">'

            // Add farmland ID
            if (matchedId) {
              popupContent += `<h4 style="margin: 0 0 8px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px;">Farmland ID: ${matchedId}</h4>`
            }

            // Add statistics based on data type
            if (farmlandStats) {
              if (farmlandStats.type === 'ndvi') {
                // NDVI Time Series Display
                popupContent += '<div style="background: #f0f9ff; padding: 8px; border-radius: 4px; margin-bottom: 8px; border-left: 3px solid #10b981;">'
                popupContent += '<strong style="color: #059669;">📊 NDVI Crop Health Time Series</strong><br>'
                popupContent += `<strong>Data Points:</strong> ${farmlandStats.dataCount} measurements<br>`
                
                // Get the actual time series data
                const ndviTimeSeries = farmlandValueMap.get(`ndvi_${matchedId}`)
                if (ndviTimeSeries && Array.isArray(ndviTimeSeries)) {
                  // Calculate summary statistics from time series
                  const validValues = ndviTimeSeries
                    .map(point => point.mean)
                    .filter(value => value !== undefined && value !== null && !isNaN(value))
                  
                  if (validValues.length > 0) {
                    const avg = validValues.reduce((sum, val) => sum + val, 0) / validValues.length
                    const min = Math.min(...validValues)
                    const max = Math.max(...validValues)
                    
                    popupContent += `<strong>Average NDVI:</strong> ${avg.toFixed(3)}<br>`
                    popupContent += `<strong>Range:</strong> ${min.toFixed(3)} to ${max.toFixed(3)}<br>`
                    
                    // Show health status
                    const healthStatus = avg > 0.5 ? 'Excellent' : avg > 0.2 ? 'Good' : 'Poor'
                    const healthColor = avg > 0.5 ? '#10b981' : avg > 0.2 ? '#f59e0b' : '#ef4444'
                    popupContent += `<strong>Health Status:</strong> <span style="color: ${healthColor}; font-weight: bold;">${healthStatus}</span><br>`
                    
                    // Show recent measurements (last 3)
                    const recentData = ndviTimeSeries.slice(-3)
                    popupContent += '<br><strong>Recent Measurements:</strong><br>'
                    popupContent += '<div style="font-size: 11px; color: #555; max-height: 60px; overflow-y: auto;">'
                    recentData.forEach(point => {
                      const date = new Date(point.date).toLocaleDateString()
                      const value = point.mean?.toFixed(3) || 'N/A'
                      popupContent += `${date}: ${value}<br>`
                    })
                    popupContent += '</div>'
                  }
                }
                popupContent += '</div>'
              } else {
                // Original soil statistics display
                popupContent += '<div style="background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 8px;">'
                popupContent += '<strong style="color: #2563eb;">🌾 Soil Statistics</strong><br>'
                popupContent += `<strong>Average:</strong> ${farmlandStats.average?.toFixed(3) || 'N/A'}<br>`
                popupContent += `<strong>Min:</strong> ${farmlandStats.min?.toFixed(3) || 'N/A'}<br>`
                popupContent += `<strong>Max:</strong> ${farmlandStats.max?.toFixed(3) || 'N/A'}<br>`
                popupContent += `<strong>Count:</strong> ${farmlandStats.count?.toLocaleString() || 'N/A'} pixels<br>`
                if (farmlandStats.stddev) {
                  popupContent += `<strong>Std Dev:</strong> ${farmlandStats.stddev.toFixed(3)}<br>`
                }
                popupContent += '</div>'
              }
            }

            // Add feature properties
            popupContent += '<div style="font-size: 12px; color: #666;">'
            popupContent += '<strong>Properties:</strong><br>'
            const propertiesToShow = Object.entries(feature.properties)
              .slice(0, 4) // Show first 4 properties
              .map(([key, value]) => `${key}: ${value}`)
              .join('<br>')
            popupContent += propertiesToShow
            popupContent += '</div>'

            popupContent += '</div>'

            layer.bindPopup(popupContent, {
              maxWidth: 300,
              className: 'farmland-popup'
            })
          }
        }
      })

      farmlandLayer.addTo(mapInstanceRef.current)
      farmlandLayerRef.current = farmlandLayer

      // Bring drawn items to front
      if (drawnItemsRef.current) {
        drawnItemsRef.current.bringToFront()
      }

      // Cleanup function
      return () => {
        if (farmlandLayer && mapInstanceRef.current) {
          try {
            mapInstanceRef.current.removeLayer(farmlandLayer)
          } catch (e) {
            // Layer might already be removed, ignore error
          }
        }
      }
    }
  }, [farmlandGeoJSON])

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full" />

      {/* Location button */}
      <button
        onClick={panToUserLocation}
        className="absolute top-32 right-3 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200 group z-[1000]"
        title="Go to my location"
        aria-label="Go to my location"
        style={{ marginTop: '60px' }}
        data-tutorial="location-button"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-gray-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
        >
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path
            d="M12 2V8M12 16V22M22 12H16M8 12H2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </button>

      {/* Map attribution */}
      <div className="absolute bottom-2 right-2 bg-background/90 border px-2 py-1 text-xs rounded text-muted-foreground">
        © OpenStreetMap contributors
      </div>
    </div>
  )
}