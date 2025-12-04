'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMapStore } from '@/lib/stores/mapStore'
import { apiClient } from '@/lib/api/client'
import { AlertCircle, RefreshCw, Droplets, CheckCircle, Clock, XCircle, Download, History, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { GeoJSONGeometry, ETMapStatusResponse, ETMapStatus } from '@/lib/types/api'
import { cn } from '@/lib/utils'
import { formatDateString, parseDate } from '@/lib/utils'

// Status stages definition
const STAGES: { key: ETMapStatus; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'landsat_started', label: 'Fetching Landsat Data' },
  { key: 'prism_started', label: 'Fetching PRISM Data' },
  { key: 'nldas_started', label: 'Fetching NLDAS Data' },
  { key: 'calculation_started', label: 'Calculating ET Map' },
  { key: 'calculation_complete', label: 'Completed' },
]

// Helper to check if status is complete (handles both 'completed' and 'calculation_complete')
const isStatusComplete = (status: ETMapStatus | undefined): boolean => {
  return status === 'completed' || status === 'calculation_complete'
}

// History entry type
interface ETMapHistoryEntry {
  requestId: string
  timestamp: string
  dateFrom: string
  dateTo: string
  geometry: GeoJSONGeometry[]
  status?: ETMapStatus
}

// localStorage keys
const LOCALSTORAGE_KEY = 'etmap_request_id'
const HISTORY_KEY = 'etmap_history'
const MAX_HISTORY_ENTRIES = 20

// History helpers
function loadHistory(): ETMapHistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      return JSON.parse(stored) as ETMapHistoryEntry[]
    }
  } catch (e) {
    console.error('Failed to load ETMap history:', e)
  }
  return []
}

function saveHistory(history: ETMapHistoryEntry[]): void {
  try {
    // Keep only the most recent entries
    const trimmed = history.slice(0, MAX_HISTORY_ENTRIES)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
  } catch (e) {
    console.error('Failed to save ETMap history:', e)
  }
}

function addToHistory(entry: ETMapHistoryEntry): ETMapHistoryEntry[] {
  const history = loadHistory()
  // Remove any existing entry with the same requestId
  const filtered = history.filter(h => h.requestId !== entry.requestId)
  // Add new entry at the beginning
  const updated = [entry, ...filtered]
  saveHistory(updated)
  return updated
}

function removeFromHistory(requestId: string): ETMapHistoryEntry[] {
  const history = loadHistory()
  const updated = history.filter(h => h.requestId !== requestId)
  saveHistory(updated)
  return updated
}

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

/**
 * Calculate approximate area in square miles using Shoelace formula
 */
function calculateAreaSqMiles(polygons: GeoJSONGeometry[]): number {
  if (!polygons.length) return 0

  let totalArea = 0

  polygons.forEach(polygon => {
    if (!polygon.coordinates || !polygon.coordinates[0]) return

    const coords = polygon.coordinates[0] as [number, number][]
    if (coords.length < 3) return

    let area = 0
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length
      const [lng1, lat1] = coords[i]
      const [lng2, lat2] = coords[j]
      area += lng1 * lat2
      area -= lng2 * lat1
    }
    area = Math.abs(area) / 2

    const latMid = coords.reduce((sum, c) => sum + c[1], 0) / coords.length
    const latMiles = 69.0
    const lngMiles = 69.0 * Math.cos(latMid * Math.PI / 180)

    totalArea += area * latMiles * lngMiles
  })

  return totalArea
}

/**
 * Calculate MBR (Minimum Bounding Rectangle) for multiple polygons
 */
function calculateMultiPolygonBounds(polygons: GeoJSONGeometry[]): [[number, number], [number, number]] | null {
  if (!polygons || polygons.length === 0) return null

  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity

  polygons.forEach((polygon) => {
    if (polygon && polygon.coordinates && Array.isArray(polygon.coordinates) && polygon.coordinates[0]) {
      const coords = polygon.coordinates[0] as [number, number][]
      if (Array.isArray(coords)) {
        coords.forEach(([lng, lat]: [number, number]) => {
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
          minLng = Math.min(minLng, lng)
          maxLng = Math.max(maxLng, lng)
        })
      }
    }
  })

  return [[minLat, minLng], [maxLat, maxLng]]
}

const MAX_AREA_SQ_MILES = 60
const MAX_POLL_TIME_MS = 60 * 60 * 1000 // 1 hour
const INITIAL_POLL_DELAY = 2000 // 2 seconds
const MAX_POLL_DELAY = 30000 // 30 seconds

export function ETMapAnalysis() {
  const {
    selectedDateRange,
    drawnPolygons,
    setSelectedDateRange,
    setETMapImageOverlay,
    setETMapRequestId,
    etmapRequestId,
    clearTrigger,
    drawnItems,
    setDrawnPolygons,
    mapInstance
  } = useMapStore()

  const [jobStatus, setJobStatus] = useState<ETMapStatusResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [history, setHistory] = useState<ETMapHistoryEntry[]>([])
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)

  const isPollingRef = useRef(false)
  const pollStartTimeRef = useRef<number | null>(null)
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentGeometryRef = useRef<GeoJSONGeometry[]>([])

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  // Keep currentGeometryRef in sync with drawnPolygons
  useEffect(() => {
    if (drawnPolygons && drawnPolygons.length > 0) {
      currentGeometryRef.current = drawnPolygons
    }
  }, [drawnPolygons])

  // Clear state when clearTrigger changes
  useEffect(() => {
    if (clearTrigger > 0) {
      setJobStatus(null)
      setRequestId(null)
      setETMapRequestId(null)
      setETMapImageOverlay(null, null)
      setSelectedHistoryId(null)
      isPollingRef.current = false
      pollStartTimeRef.current = null
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
        pollTimeoutRef.current = null
      }
      localStorage.removeItem(LOCALSTORAGE_KEY)
    }
  }, [clearTrigger, setETMapImageOverlay, setETMapRequestId])

  // Restore request_id from localStorage on mount
  useEffect(() => {
    const savedId = localStorage.getItem(LOCALSTORAGE_KEY)
    if (savedId && !requestId) {
      setRequestId(savedId)
      setETMapRequestId(savedId)
    }
  }, [requestId, setETMapRequestId])

  // Start polling when requestId is set
  useEffect(() => {
    if (requestId && !isPollingRef.current) {
      pollStatus()
    }

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId])

  const pollStatus = useCallback(async () => {
    if (!requestId || isPollingRef.current) return

    isPollingRef.current = true
    pollStartTimeRef.current = Date.now()
    let delay = INITIAL_POLL_DELAY

    const poll = async () => {
      if (!requestId) {
        isPollingRef.current = false
        return
      }

      // Check if we've exceeded max poll time
      if (pollStartTimeRef.current && Date.now() - pollStartTimeRef.current > MAX_POLL_TIME_MS) {
        isPollingRef.current = false
        toast.error('Polling timed out after 1 hour. The calculation may still be running - click Refresh to check status manually.', {
          duration: 10000
        })
        return
      }

      try {
        const status = await apiClient.getETMapStatus(requestId)
        setJobStatus(status)

        // Update history with latest status
        const currentHistory = loadHistory()
        const updatedHistory = currentHistory.map(h =>
          h.requestId === requestId ? { ...h, status: status.status } : h
        )
        saveHistory(updatedHistory)
        setHistory(updatedHistory)

        if (isStatusComplete(status.status)) {
          isPollingRef.current = false
          // Load and display PNG using the geometry from ref
          try {
            const imageBlob = await apiClient.getETMapImage(requestId)
            const imageUrl = URL.createObjectURL(imageBlob)
            const bounds = calculateMultiPolygonBounds(currentGeometryRef.current)
            if (bounds) {
              setETMapImageOverlay(imageUrl, bounds)
            }
            toast.success('ET Map calculation complete!')
          } catch (imgError) {
            console.error('Failed to load ET Map image:', imgError)
            toast.error('ET Map complete but failed to load image')
          }
          return
        }

        if (status.status === 'failed') {
          isPollingRef.current = false
          toast.error(status.message || 'ET Map calculation failed')
          return
        }

        // Schedule next poll with exponential backoff
        delay = Math.min(delay * 1.5, MAX_POLL_DELAY)
        pollTimeoutRef.current = setTimeout(poll, delay)

      } catch (error) {
        console.error('Polling error:', error)
        // Continue polling despite errors
        delay = Math.min(delay * 1.5, MAX_POLL_DELAY)
        pollTimeoutRef.current = setTimeout(poll, delay)
      }
    }

    poll()
  }, [requestId, setETMapImageOverlay])

  const handleSubmit = async () => {
    if (!drawnPolygons || drawnPolygons.length === 0) {
      toast.error('Please draw a farm area on the map first!')
      return
    }

    // Calculate and validate area
    const areaSqMiles = calculateAreaSqMiles(drawnPolygons)
    if (areaSqMiles > MAX_AREA_SQ_MILES) {
      toast.error(`Area too large (${areaSqMiles.toFixed(1)} sq mi). Maximum is ${MAX_AREA_SQ_MILES} sq miles.`)
      return
    }

    // Clear previous results
    setJobStatus(null)
    setETMapImageOverlay(null, null)
    setSelectedHistoryId(null)
    isPollingRef.current = false
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }

    setIsSubmitting(true)

    try {
      // Create geometry - MultiPolygon if multiple polygons, single polygon if one
      let geometry: GeoJSONGeometry
      if (drawnPolygons.length === 1) {
        geometry = drawnPolygons[0]
      } else {
        geometry = {
          type: 'MultiPolygon',
          coordinates: drawnPolygons.map(polygon => polygon.coordinates)
        } as GeoJSONGeometry
      }

      const response = await apiClient.submitETMapRequest({
        geometry,
        dateFrom: selectedDateRange.from,
        dateTo: selectedDateRange.to
      })

      const newRequestId = response.request_id
      setRequestId(newRequestId)
      setETMapRequestId(newRequestId)
      localStorage.setItem(LOCALSTORAGE_KEY, newRequestId)

      // Save to history
      const historyEntry: ETMapHistoryEntry = {
        requestId: newRequestId,
        timestamp: new Date().toISOString(),
        dateFrom: selectedDateRange.from,
        dateTo: selectedDateRange.to,
        geometry: [...drawnPolygons],
        status: response.status || 'pending'
      }
      const updatedHistory = addToHistory(historyEntry)
      setHistory(updatedHistory)
      setSelectedHistoryId(newRequestId)

      // Update geometry ref
      currentGeometryRef.current = [...drawnPolygons]

      setJobStatus({
        request_id: newRequestId,
        status: response.status || 'pending'
      })

      toast.success('ET Map request submitted! Processing will begin shortly.')

    } catch (error: any) {
      console.error('Submit error:', error)
      toast.error(error.message || 'Failed to submit ET Map request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectHistoryEntry = async (entry: ETMapHistoryEntry) => {
    // Stop any existing polling
    isPollingRef.current = false
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }

    // Clear current map state
    setETMapImageOverlay(null, null)
    setJobStatus(null)

    // Clear drawn items on map and add the history geometry
    if (drawnItems) {
      drawnItems.clearLayers()

      // Dynamically import Leaflet (only runs on client)
      const L = (await import('leaflet')).default

      // Draw the geometry from history
      entry.geometry.forEach(geom => {
        if (geom.coordinates && geom.coordinates[0]) {
          const coords = geom.coordinates[0] as [number, number][]
          // Convert [lng, lat] to [lat, lng] for Leaflet
          const latLngs = coords.map(([lng, lat]) => [lat, lng] as [number, number])
          const polygon = L.polygon(latLngs, {
            color: '#3388ff',
            weight: 2,
            fillOpacity: 0.2
          })
          drawnItems.addLayer(polygon)
        }
      })
    }

    // Update store with the geometry
    setDrawnPolygons(entry.geometry)
    currentGeometryRef.current = entry.geometry

    // Update date range
    setSelectedDateRange({
      from: entry.dateFrom,
      to: entry.dateTo
    })

    // Set the request ID
    setSelectedHistoryId(entry.requestId)
    localStorage.setItem(LOCALSTORAGE_KEY, entry.requestId)

    // Zoom to the geometry
    if (mapInstance && entry.geometry.length > 0) {
      const bounds = calculateMultiPolygonBounds(entry.geometry)
      if (bounds) {
        mapInstance.fitBounds(bounds, { padding: [50, 50] })
      }
    }

    // Immediately fetch the current status
    try {
      const status = await apiClient.getETMapStatus(entry.requestId)
      setJobStatus(status)

      // Update history with latest status
      const currentHistory = loadHistory()
      const updatedHistory = currentHistory.map(h =>
        h.requestId === entry.requestId ? { ...h, status: status.status } : h
      )
      saveHistory(updatedHistory)
      setHistory(updatedHistory)

      // If completed, load the image
      if (isStatusComplete(status.status)) {
        try {
          const imageBlob = await apiClient.getETMapImage(entry.requestId)
          const imageUrl = URL.createObjectURL(imageBlob)
          const bounds = calculateMultiPolygonBounds(entry.geometry)
          if (bounds) {
            setETMapImageOverlay(imageUrl, bounds)
          }
          toast.success('ET Map loaded from history!')
        } catch (imgError) {
          console.error('Failed to load ET Map image:', imgError)
        }
      } else if (status.status === 'failed') {
        toast.error(status.message || 'This request failed')
      } else {
        // Still processing - start polling
        toast.success('Loaded history entry - still processing...')
        setRequestId(entry.requestId)
        setETMapRequestId(entry.requestId)
      }
    } catch (error: any) {
      console.error('Failed to fetch status:', error)
      toast.error('Failed to fetch status for this request')
      // Still set the request ID so user can try refresh
      setRequestId(entry.requestId)
      setETMapRequestId(entry.requestId)
    }
  }

  const handleDeleteHistoryEntry = (e: React.MouseEvent, requestId: string) => {
    e.stopPropagation()
    const updated = removeFromHistory(requestId)
    setHistory(updated)

    if (selectedHistoryId === requestId) {
      setSelectedHistoryId(null)
    }

    toast.success('History entry removed')
  }

  const handleManualRefresh = async () => {
    if (!requestId) return

    setIsRefreshing(true)
    try {
      const status = await apiClient.getETMapStatus(requestId)
      setJobStatus(status)

      // Update history with latest status
      const currentHistory = loadHistory()
      const updatedHistory = currentHistory.map(h =>
        h.requestId === requestId ? { ...h, status: status.status } : h
      )
      saveHistory(updatedHistory)
      setHistory(updatedHistory)

      if (isStatusComplete(status.status)) {
        // Load PNG if not already loaded
        try {
          const imageBlob = await apiClient.getETMapImage(requestId)
          const imageUrl = URL.createObjectURL(imageBlob)
          const bounds = calculateMultiPolygonBounds(currentGeometryRef.current)
          if (bounds) {
            setETMapImageOverlay(imageUrl, bounds)
          }
          toast.success('ET Map loaded!')
        } catch (imgError) {
          console.error('Failed to load ET Map image:', imgError)
        }
      } else if (status.status === 'failed') {
        toast.error(status.message || 'ET Map calculation failed')
      } else {
        toast.success('Status updated')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to refresh status')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDownloadTif = async () => {
    if (!requestId) return

    const loadingToast = toast.loading('Preparing GeoTIFF download...')
    try {
      const blob = await apiClient.downloadETMapTif(requestId)

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `etmap-${requestId}.tif`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.dismiss(loadingToast)
      toast.success('GeoTIFF downloaded!')
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(error.message || 'Failed to download GeoTIFF')
    }
  }

  const handleDownloadPng = async () => {
    if (!requestId) return

    const loadingToast = toast.loading('Preparing PNG download...')
    try {
      const blob = await apiClient.getETMapImage(requestId)

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `etmap-${requestId}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.dismiss(loadingToast)
      toast.success('PNG downloaded!')
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(error.message || 'Failed to download PNG')
    }
  }

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    setSelectedDateRange({
      ...selectedDateRange,
      [field]: value
    })
  }

  const handleClearRequest = () => {
    setJobStatus(null)
    setRequestId(null)
    setETMapRequestId(null)
    setETMapImageOverlay(null, null)
    setSelectedHistoryId(null)
    isPollingRef.current = false
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
    }
    localStorage.removeItem(LOCALSTORAGE_KEY)
  }

  // Calculate current stage index for display
  const currentStageIdx = jobStatus ? STAGES.findIndex(s => s.key === jobStatus.status) : -1
  const isFailed = jobStatus?.status === 'failed'
  const isCompleted = isStatusComplete(jobStatus?.status)

  return (
    <div className="p-4 space-y-6">
      {/* Parameters Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-foreground flex items-center">
          <Droplets className="h-4 w-4 mr-2" />
          Evapotranspiration Map
        </h3>

        <div className="text-sm text-muted-foreground mb-4">
          Calculate evapotranspiration (ET) for your farm area using satellite data and meteorological models.
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline gap-4">
            <label className="text-sm font-medium text-foreground w-20 shrink-0">
              Start Date
            </label>
            <Input
              type="date"
              value={selectedDateRange.from}
              onChange={(e) => handleDateChange('from', e.target.value)}
              max={selectedDateRange.to}
              className="flex-1"
              style={{ height: '40px', padding: '8px 12px', fontSize: '14px', lineHeight: '20px' }}
            />
          </div>

          <div className="flex items-baseline gap-4">
            <label className="text-sm font-medium text-foreground w-20 shrink-0">
              End Date
            </label>
            <Input
              type="date"
              value={selectedDateRange.to}
              onChange={(e) => handleDateChange('to', e.target.value)}
              min={selectedDateRange.from}
              className="flex-1"
              style={{ height: '40px', padding: '8px 12px', fontSize: '14px', lineHeight: '20px' }}
            />
          </div>
        </div>

        {/* Date range info */}
        <div className="text-sm bg-muted/30 p-3 rounded-lg border">
          <p className="font-medium text-foreground">
            Selected time period:
          </p>
          <p className="text-muted-foreground mt-1">
            From {formatDateString(selectedDateRange.from)} to {formatDateString(selectedDateRange.to)}
          </p>
          <p className="text-muted-foreground">
            Total days: {(() => {
              const fromDate = parseDate(selectedDateRange.from)
              const toDate = parseDate(selectedDateRange.to)
              return Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
            })()}
          </p>
        </div>

      </div>

      {/* Submit Button */}
      <div className="space-y-3">
        <Button
          onClick={handleSubmit}
          disabled={!drawnPolygons || drawnPolygons.length === 0 || isSubmitting || calculateAreaSqMiles(drawnPolygons) > MAX_AREA_SQ_MILES}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Submitting...
            </>
          ) : (
            <>
              <Droplets className="h-4 w-4 mr-2" />
              Calculate ET Map
            </>
          )}
        </Button>

        {/* Warning Messages */}
        {(!drawnPolygons || drawnPolygons.length === 0) && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Draw a polygon on the map to define your farm area</p>
          </div>
        )}
      </div>

      {/* Status Section */}
      {(jobStatus || requestId) && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-foreground">Processing Status</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearRequest}
              className="text-xs"
            >
              Clear
            </Button>
          </div>

          {/* Stage indicators */}
          <div className="space-y-1">
            {STAGES.map((stage, idx) => {
              const isPast = idx < currentStageIdx || isCompleted
              const isCurrent = idx === currentStageIdx && !isCompleted
              const isFuture = idx > currentStageIdx && !isCompleted
              const isCompletedStage = stage.key === 'calculation_complete' && isCompleted

              return (
                <div
                  key={stage.key}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg text-sm transition-all duration-200",
                    isCurrent && !isFailed && "bg-blue-100 dark:bg-blue-900/50 font-semibold text-blue-800 dark:text-blue-200 border-2 border-blue-400 dark:border-blue-500 shadow-md",
                    isPast && !isCompletedStage && "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
                    isCompletedStage && "bg-green-100 dark:bg-green-900/40 font-semibold text-green-700 dark:text-green-300 border-2 border-green-400 dark:border-green-500",
                    isFuture && "text-muted-foreground opacity-40",
                    isFailed && isCurrent && "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-2 border-red-400 font-semibold"
                  )}
                >
                  {isPast && !isCompletedStage && <CheckCircle className="h-5 w-5 text-green-500" />}
                  {isCompletedStage && <CheckCircle className="h-5 w-5 text-green-500 animate-bounce" />}
                  {isCurrent && !isFailed && (
                    <div className="h-5 w-5 border-2 border-blue-300 dark:border-blue-600 border-t-blue-600 dark:border-t-blue-300 rounded-full animate-spin" />
                  )}
                  {isCurrent && isFailed && <XCircle className="h-5 w-5 text-red-500" />}
                  {isFuture && <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />}
                  <span>{stage.label}</span>
                  {isCurrent && !isFailed && (
                    <span className="ml-auto text-xs text-blue-600 dark:text-blue-300 font-normal">In Progress...</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Error message */}
          {isFailed && jobStatus?.message && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded">
              {jobStatus.message}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing || !requestId}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPng}
              disabled={!isCompleted}
            >
              <Download className="h-4 w-4 mr-2" />
              PNG
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadTif}
              disabled={!isCompleted}
            >
              <Download className="h-4 w-4 mr-2" />
              TIF
            </Button>
          </div>

          {/* Request ID */}
          {requestId && (
            <div className="text-xs text-muted-foreground">
              Request ID: {requestId}
            </div>
          )}
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div className="border-t pt-4">
          <button
            onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-medium text-foreground flex items-center">
              <History className="h-4 w-4 mr-2" />
              Request History ({history.length})
            </h4>
            {isHistoryExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {isHistoryExpanded && (
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {history.map((entry) => (
                <div
                  key={entry.requestId}
                  onClick={() => handleSelectHistoryEntry(entry)}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-all hover:bg-muted/50",
                    selectedHistoryId === entry.requestId && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {formatTimestamp(entry.timestamp)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {entry.dateFrom} to {entry.dateTo}
                      </div>
                      <div className="text-xs text-muted-foreground break-all">
                        ID: {entry.requestId}
                      </div>
                      {entry.status && (
                        <div className={cn(
                          "text-xs mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
                          isStatusComplete(entry.status) && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                          entry.status === 'failed' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          !isStatusComplete(entry.status) && entry.status !== 'failed' && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        )}>
                          {isStatusComplete(entry.status) && <CheckCircle className="h-3 w-3" />}
                          {entry.status === 'failed' && <XCircle className="h-3 w-3" />}
                          {!isStatusComplete(entry.status) && entry.status !== 'failed' && <Clock className="h-3 w-3" />}
                          {isStatusComplete(entry.status) ? 'Completed' : entry.status === 'failed' ? 'Failed' : 'Processing'}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleDeleteHistoryEntry(e, entry.requestId)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="text-xs text-muted-foreground border-t pt-4 space-y-2">
        <p><strong>Data Sources:</strong></p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Landsat satellite imagery (vegetation indices)</li>
          <li>PRISM climate data (temperature, precipitation)</li>
          <li>NLDAS meteorological data (hourly)</li>
        </ul>
        <p className="mt-2">
          <strong>Note:</strong> Processing may take several minutes depending on the area size and date range.
        </p>
      </div>
    </div>
  )
}
