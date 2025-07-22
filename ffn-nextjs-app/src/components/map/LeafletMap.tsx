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

  const { 
    selectedDataset, 
    currentBounds, 
    drawnPolygon,
    soilImageUrl,
    soilImageBounds,
    farmlandGeoJSON,
    setCurrentBounds,
    setDrawnPolygon,
    setCurrentZoom,
    setMapInstance,
    setDrawnItems
  } = useMapStore()

  const { resolvedTheme } = useTheme()



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
        },
        rectangle: {},
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
      drawnItems.addLayer(layer)
      
      // Convert to GeoJSON and store in state
      const geoJSON = layer.toGeoJSON()
      setDrawnPolygon(geoJSON.geometry)
      
      toast.success('Polygon drawn successfully')
    })

    map.on('draw:deleted', (event: any) => {
      // Clear all drawn items
      drawnItems.clearLayers()
      setDrawnPolygon(null)
      toast.success('Area cleared! You can draw a new area now.')
    })

    map.on('draw:edited', (event: any) => {
      const layers = event.layers
      layers.eachLayer((layer: any) => {
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

    // Handle map movement to update bounds and zoom
    map.on('moveend zoomend', () => {
      const bounds = map.getBounds()
      setCurrentBounds({
        minx: bounds.getWest(),
        miny: bounds.getSouth(),
        maxx: bounds.getEast(),
        maxy: bounds.getNorth(),
      })
      setCurrentZoom(map.getZoom())
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
  }, [])

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

      // Center map on appropriate state
      if (selectedDataset === 'farmland') {
        // California center
        mapInstanceRef.current.setView([36.7783, -119.4179], 6)
        toast.success('Loaded California farmland dataset')
      } else if (selectedDataset === 'AZ_Farmland') {
        // Arizona center  
        mapInstanceRef.current.setView([34.0489, -111.0937], 6)
        toast.success('Loaded Arizona farmland dataset')
      }
    }
  }, [selectedDataset])

  // Handle soil image overlay
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Remove existing overlay
    if (soilImageOverlayRef.current) {
      mapInstanceRef.current.removeLayer(soilImageOverlayRef.current)
      soilImageOverlayRef.current = null
    }

    // Add new overlay if image and bounds are available
    if (soilImageUrl && soilImageBounds) {
      const overlay = L.imageOverlay(soilImageUrl, soilImageBounds, {
        opacity: 1.0,
        className: 'soil-image-overlay'
      })
      
      overlay.addTo(mapInstanceRef.current)
      soilImageOverlayRef.current = overlay
      
      // Bring overlay to front but keep it below drawn items
      overlay.bringToFront()
      if (drawnItemsRef.current) {
        drawnItemsRef.current.bringToFront()
      }
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
      
      {/* Map attribution */}
      <div className="absolute bottom-2 right-2 bg-background/90 border px-2 py-1 text-xs rounded text-muted-foreground">
        © OpenStreetMap contributors
      </div>
    </div>
  )
}