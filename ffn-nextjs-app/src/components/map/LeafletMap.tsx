'use client'

import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet-draw'
import { useMapStore } from '@/lib/stores/mapStore'
import { useTheme } from '@/lib/contexts/ThemeContext'
import { toast } from '@/lib/utils/toast'
import { valueToGrayscale } from '@/lib/utils/color'

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
  const farmlandLayerRef = useRef<L.GeoJSON | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const isUpdatingFromURL = useRef(false)
  const hasCheckedURLCoordinates = useRef(false)

  const { 
    selectedDataset, 
    currentBounds, 
    currentCenter,
    currentZoom,
    drawnPolygon,
    soilImageUrl,
    soilImageBounds,
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
        setTimeout(() => {
          mapInstanceRef.current?.removeLayer(userMarker)
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
    map.on('moveend zoomend', () => {
      // Don't update store if we're in the middle of applying URL state
      if (isUpdatingFromURL.current) {
        return
      }
      
      const bounds = map.getBounds()
      const center = map.getCenter()
      const zoom = map.getZoom()
      
      setCurrentBounds({
        minx: bounds.getWest(),
        miny: bounds.getSouth(),
        maxx: bounds.getEast(),
        maxy: bounds.getNorth(),
      })
      setCurrentZoom(zoom)
      setCurrentCenter([center.lat, center.lng])
    })

    mapInstanceRef.current = map

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        setMapInstance(null)
        setDrawnItems(null)
        
        // Clean up tile layer references
        if (vectorTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(vectorTileLayerRef.current)
          vectorTileLayerRef.current = null
        }
        
        // Clean up soil image overlay
        if (soilImageOverlayRef.current) {
          mapInstanceRef.current.removeLayer(soilImageOverlayRef.current)
          soilImageOverlayRef.current = null
        }

        // Clean up farmland layer
        if (farmlandLayerRef.current) {
          mapInstanceRef.current.removeLayer(farmlandLayerRef.current)
          farmlandLayerRef.current = null
        }
        
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
      setTimeout(() => { isUpdatingFromURL.current = false }, 100)
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
        attribution: 'FutureFarmNow Vector Data'
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
  }, [selectedDataset, isInitialLoad])

  // Handle soil image overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Remove existing overlay
    if (soilImageOverlayRef.current) {
      mapInstanceRef.current.removeLayer(soilImageOverlayRef.current)
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
    if (soilImageUrl && soilImageBounds) {
      const overlay = L.imageOverlay(soilImageUrl, soilImageBounds, {
        opacity: 1.0,
        className: 'soil-image-overlay'
      })
      
      overlay.addTo(mapInstanceRef.current)
      soilImageOverlayRef.current = overlay
      
      // Bring overlay to front
      overlay.bringToFront()
    }
  }, [soilImageUrl, soilImageBounds])

  // Handle farmland GeoJSON overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Remove existing farmland layer
    if (farmlandLayerRef.current) {
      mapInstanceRef.current.removeLayer(farmlandLayerRef.current)
      farmlandLayerRef.current = null
    }

    // Add new farmland layer if GeoJSON is available
    if (farmlandGeoJSON) {
      const geoJSONData = farmlandGeoJSON.geoJSON || farmlandGeoJSON
      const colorData = farmlandGeoJSON.colorData
      
      // Create a map of farmland IDs to their average values if color data is available
      const farmlandValueMap = new Map()
      if (colorData && colorData.farmlands) {
        console.log('Color data available:', colorData)
        console.log('Farmlands data:', colorData.farmlands)
        
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
          
          console.log(`Farmland ${index}:`, { possibleIds, value, farmland })
          
          if (possibleIds.length > 0 && value !== undefined) {
            // Map all possible IDs to the same value, and also store the full farmland data
            possibleIds.forEach(id => {
              farmlandValueMap.set(id.toString(), value)
              // Also store the full farmland stats for popup display
              farmlandValueMap.set(`stats_${id}`, farmland)
              console.log(`Mapped ID ${id} to value ${value}`)
            })
          }
        })
        
        console.log('Final farmland value map:', farmlandValueMap)
      }
      
      const farmlandLayer = L.geoJSON(geoJSONData, {
        style: (feature) => {
          // Default style
          let fillColor = '#3b82f6'
          let fillOpacity = 0.1
          
          // If we have color data, use the gradient based on average value
          if (colorData && feature?.properties) {
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
            
            let value
            let matchedId
            
            // Try to find a matching value
            for (const id of possibleFeatureIds) {
              value = farmlandValueMap.get(id.toString())
              if (value !== undefined) {
                matchedId = id
                break
              }
            }
            
            console.log(`Styling feature:`, { 
              featureProperties: feature.properties,
              possibleFeatureIds,
              matchedId,
              mappedValue: value, 
              colorDataMinMax: { min: colorData.min, max: colorData.max }
            })
            
            if (value !== undefined && colorData.min !== undefined && colorData.max !== undefined) {
              fillColor = valueToGrayscale(value, colorData.min, colorData.max)
              fillOpacity = 0.7 // Higher opacity for colored farmlands
              console.log(`Applied color ${fillColor} for value ${value} (ID: ${matchedId})`)
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
            
            // Add soil statistics if available
            if (farmlandStats) {
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