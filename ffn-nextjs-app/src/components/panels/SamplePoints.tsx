'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectOption } from '@/components/ui/select'
import { useMapStore } from '@/lib/stores/mapStore'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { SoilLayerEnum, GeoJSONGeometry } from '@/lib/types/api'
import { AlertCircle, Target, MapPin, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'

const SOIL_LAYERS: { value: SoilLayerEnum; label: string; description: string }[] = [
  { value: 'alpha', label: 'Soil Acidity (α)', description: 'Van Genuchten parameter for soil water retention' },
  { value: 'clay', label: 'Clay Content', description: 'Fine particles that hold nutrients' },
  { value: 'sand', label: 'Sand Content', description: 'Large particles for drainage' },
  { value: 'silt', label: 'Silt Content', description: 'Medium particles for water retention' },
  { value: 'bd', label: 'Soil Compaction', description: 'How tightly packed your soil is' },
  { value: 'ksat', label: 'Water Drainage', description: 'How fast water moves through soil' },
  { value: 'ph', label: 'Soil Acidity (pH)', description: 'How acidic or basic your soil is' },
  { value: 'om', label: 'Organic Matter', description: 'Decomposed plant/animal material' }
]

const SOIL_DEPTHS = [
  { value: '0-5', label: 'Surface (0-5 cm / 0-2 inches)', description: 'Top soil where seeds germinate' },
  { value: '5-15', label: 'Shallow (5-15 cm / 2-6 inches)', description: 'Root zone for small plants' },
  { value: '15-30', label: 'Medium (15-30 cm / 6-12 inches)', description: 'Main root zone for crops' },
  { value: '30-60', label: 'Deep (30-60 cm / 1-2 feet)', description: 'Deep root zone' },
  { value: '60-100', label: 'Very Deep (60-100 cm / 2-3 feet)', description: 'Subsoil layer' },
  { value: '100-200', label: 'Deepest (100-200 cm / 3-6 feet)', description: 'Deep subsoil' }
]

const SAMPLE_COUNTS = [5, 7, 10, 12]

export function SamplePoints() {
  const {
    selectedSoilDepth,
    drawnPolygons,
    setSelectedSoilDepth,
    setSamplePoints,
    clearTrigger
  } = useMapStore()

  const [selectedLayers, setSelectedLayers] = useState<SoilLayerEnum[]>(['alpha'])
  const [numPoints, setNumPoints] = useState<number>(5)
  const [results, setResults] = useState<any>(null)

  // Clear results when analysis is cleared
  useEffect(() => {
    setResults(null)
  }, [clearTrigger])

  const samplePointsMutation = useMutation({
    mutationFn: (params: any) => apiClient.getSoilSamplePoints(params),
    onSuccess: (data) => {
      setResults(data)
      setSamplePoints(data.results)
      toast.success(`Created ${data.results.length} optimal soil sampling locations for your field!`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Could not create sampling points. Please try again.')
    }
  })

  const handleAnalyze = () => {
    if (!drawnPolygons || drawnPolygons.length === 0) {
      toast.error('Please draw your farm area on the map first! Use the drawing tools on the map.')
      return
    }

    if (selectedLayers.length === 0) {
      toast.error('Please select at least one soil property to test')
      return
    }

    // Clear previous results
    setResults(null)

    // Create geometry - MultiPolygon if multiple polygons, single polygon if one
    let geometry: GeoJSONGeometry;
    if (drawnPolygons.length === 1) {
      geometry = drawnPolygons[0];
    } else {
      // Combine multiple polygons into a MultiPolygon
      geometry = {
        type: 'MultiPolygon',
        coordinates: drawnPolygons.map(polygon => polygon.coordinates)
      } as GeoJSONGeometry;
    }

    const params = {
      soildepth: selectedSoilDepth,
      layer: selectedLayers,
      num_points: numPoints as 5 | 7 | 10 | 12,
      geometry: geometry
    }

    toast('Finding the best spots to sample your soil... This may take a moment.', {
      icon: '⏳'
    })
    samplePointsMutation.mutate(params)
  }

  const handleLayerToggle = (layer: SoilLayerEnum) => {
    setSelectedLayers(prev => {
      if (prev.includes(layer)) {
        return prev.filter(l => l !== layer)
      } else {
        return [...prev, layer]
      }
    })
  }

  const exportPoints = () => {
    if (!results) return

    const csvContent = [
      'ID,Latitude,Longitude',
      ...results.results.map((point: any) =>
        `${point.id},${point.y},${point.x}`
      )
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sample_points_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('GPS coordinates downloaded! Import this file into your GPS device.')
  }

  return (
    <div className="p-4 space-y-6" data-tutorial="sample-panel">
      {/* Parameters Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-foreground flex items-center">
          <Target className="h-4 w-4 mr-2" />
          Get Smart Soil Sampling Locations
        </h3>

        <div className="text-sm text-muted-foreground mb-4">
          We'll help you find the best spots in your field to collect soil samples for accurate testing.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              How many sampling spots do you need?
            </label>
            <Select
              value={numPoints.toString()}
              onChange={(e) => setNumPoints(parseInt(e.target.value))}
              className="text-base"
              data-tutorial="sample-count-selector"
            >
              {SAMPLE_COUNTS.map(count => (
                <SelectOption key={count} value={count.toString()}>
                  {count} sampling spots
                </SelectOption>
              ))}
            </Select>
            <div className="text-xs text-muted-foreground mt-1">
              More points = more accurate results, but more work
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Soil depth to sample
            </label>
            <Select
              value={selectedSoilDepth}
              onChange={(e) => setSelectedSoilDepth(e.target.value)}
              className="text-base"
              data-tutorial="sample-depth-selector"
            >
              {SOIL_DEPTHS.map(depth => (
                <SelectOption key={depth.value} value={depth.value} title={depth.description}>
                  {depth.label}
                </SelectOption>
              ))}
            </Select>
            <div className="text-xs text-muted-foreground mt-1">
              {SOIL_DEPTHS.find(d => d.value === selectedSoilDepth)?.description}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              What soil properties do you want to test? (check all that apply)
            </label>
            <div className="space-y-3 max-h-40 overflow-y-auto border rounded-lg p-3 bg-muted/20" data-tutorial="sample-properties-selector">
              {SOIL_LAYERS.map(layer => (
                <label key={layer.value} className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLayers.includes(layer.value)}
                    onChange={() => handleLayerToggle(layer.value)}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-foreground">{layer.label}</span>
                    <div className="text-xs text-muted-foreground">{layer.description}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              ✓ {selectedLayers.length} soil propert{selectedLayers.length !== 1 ? 'ies' : 'y'} selected for testing
            </div>
          </div>
        </div>
      </div>

      {/* Analysis Button */}
      <div>
        <Button
          onClick={handleAnalyze}
          disabled={!drawnPolygons || drawnPolygons.length === 0 || selectedLayers.length === 0 || samplePointsMutation.isPending}
          className="w-full"
          data-tutorial="generate-samples-button"
        >
          {samplePointsMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Finding Best Sampling Spots...
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4 mr-2" />
              Find Sampling Locations
            </>
          )}
        </Button>

        {(!drawnPolygons || drawnPolygons.length === 0) && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Draw your farm area on the map first to enable smart sampling</p>
          </div>
        )}

        {selectedLayers.length === 0 && drawnPolygons && drawnPolygons.length > 0 && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Select at least one soil property you want to test</p>
          </div>
        )}
      </div>

      {/* Results Section */}
      {results && (
        <div className="space-y-6" data-tutorial="sample-results">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center">
              <Target className="h-5 w-5 mr-2 text-green-600" />
              Your Soil Sampling Locations
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPoints}
              title="Download coordinates as CSV file for GPS device"
              data-tutorial="export-gps-button"
            >
              <Download className="h-4 w-4 mr-1" />
              Download for GPS
            </Button>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border-l-4 border-blue-400">
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <strong>🎯 Next Steps:</strong>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Look at the map to see numbered sampling locations (circles with IDs)</li>
                <li>Use a GPS device to navigate to each location</li>
                <li>Collect soil samples from each spot</li>
                <li>Label each sample with its ID number</li>
                <li>Send samples to your local soil testing lab</li>
              </ol>
              <div className="mt-3 text-xs">
                💡 Tip: Hover over each circle on the map to see exact GPS coordinates
              </div>
            </div>
          </div>

          {/* Statistics */}
          {results.statistics && (
            <div className="bg-card border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-3">How Accurate Will Your Sampling Be?</h4>
              <div className="text-sm text-muted-foreground mb-4">
                These numbers show how well your sample points will represent your entire field. The closer the sample and field-wide numbers are, the better your sampling represents your whole field.
              </div>
              <div className="space-y-4">
                {Object.entries(results.statistics.layers).map(([layer, stats]: [string, any]) => {
                  const layerInfo = SOIL_LAYERS.find(l => l.value === layer)
                  const accuracy = Math.abs(stats.sample.mean - stats.actual.mean) / stats.actual.mean * 100
                  const accuracyStatus = accuracy < 5 ? 'Excellent' : accuracy < 10 ? 'Good' : accuracy < 20 ? 'Fair' : 'Poor'
                  const statusColor = accuracy < 5 ? 'text-green-600' : accuracy < 10 ? 'text-blue-600' : accuracy < 20 ? 'text-yellow-600' : 'text-red-600'

                  return (
                    <div key={layer} className="bg-muted/20 p-3 rounded-lg border-l-4 border-primary">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-medium text-sm text-foreground">
                          {layerInfo?.label || layer}
                        </h5>
                        <span className={`text-xs font-medium ${statusColor}`}>
                          {accuracyStatus} Accuracy
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sample Average:</span>
                            <span className="font-mono font-medium text-foreground">{stats.sample.mean?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Field-wide Average:</span>
                            <span className="font-mono font-medium text-foreground">{stats.actual.mean?.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Sample Variation:</span>
                            <span className="font-mono font-medium text-foreground">{stats.sample.stddev?.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Field-wide Variation:</span>
                            <span className="font-mono font-medium text-foreground">{stats.actual.stddev?.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}