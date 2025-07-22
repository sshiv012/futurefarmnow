'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectOption } from '@/components/ui/select'
import { useMapStore } from '@/lib/stores/mapStore'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { SoilLayerEnum } from '@/lib/types/api'
import { AlertCircle, Target, MapPin, Download } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { formatCoordinate } from '@/lib/utils'

const SOIL_LAYERS: { value: SoilLayerEnum; label: string; description: string }[] = [
  { value: 'ph', label: 'Soil Acidity (pH)', description: 'How acidic or basic your soil is' },
  { value: 'om', label: 'Organic Matter', description: 'Decomposed plant/animal material' },
  { value: 'clay', label: 'Clay Content', description: 'Fine particles that hold nutrients' },
  { value: 'sand', label: 'Sand Content', description: 'Large particles for drainage' },
  { value: 'silt', label: 'Silt Content', description: 'Medium particles for water retention' },
  { value: 'bd', label: 'Soil Compaction', description: 'How tightly packed your soil is' },
  { value: 'ksat', label: 'Water Drainage', description: 'How fast water moves through soil' }
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
    drawnPolygon,
    setSelectedSoilDepth
  } = useMapStore()

  const [selectedLayers, setSelectedLayers] = useState<SoilLayerEnum[]>(['ph'])
  const [numPoints, setNumPoints] = useState<number>(5)
  const [results, setResults] = useState<any>(null)

  const samplePointsMutation = useMutation({
    mutationFn: (params: any) => apiClient.getSoilSamplePoints(params),
    onSuccess: (data) => {
      setResults(data)
      toast.success(`Created ${data.results.length} optimal soil sampling locations for your field!`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Could not create sampling points. Please try again.')
    }
  })

  const handleAnalyze = () => {
    if (!drawnPolygon) {
      toast.error('Please draw your farm area on the map first! Use the drawing tools on the map.')
      return
    }

    if (selectedLayers.length === 0) {
      toast.error('Please select at least one soil property to test')
      return
    }

    // Clear previous results
    setResults(null)

    const params = {
      soildepth: selectedSoilDepth,
      layer: selectedLayers,
      num_points: numPoints as 5 | 7 | 10 | 12,
      geometry: drawnPolygon
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
      'ID,Latitude,Longitude,X,Y',
      ...results.results.map((point: any) => 
        `${point.id},${point.y},${point.x},${point.x},${point.y}`
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
    <div className="p-4 space-y-6">
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
            <div className="space-y-3 max-h-40 overflow-y-auto border rounded-lg p-3 bg-muted/20">
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
          disabled={!drawnPolygon || selectedLayers.length === 0 || samplePointsMutation.isPending}
          className="w-full"
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

        {!drawnPolygon && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Draw your farm area on the map first to enable smart sampling</p>
          </div>
        )}

        {selectedLayers.length === 0 && drawnPolygon && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Select at least one soil property you want to test</p>
          </div>
        )}
      </div>

      {/* Results Section */}
      {results && (
        <div className="space-y-6">
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
            >
              <Download className="h-4 w-4 mr-1" />
              Download for GPS
            </Button>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border-l-4 border-blue-400">
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <strong>🎯 Next Steps:</strong>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Use a GPS device to navigate to each location below</li>
                <li>Collect soil samples from each spot</li>
                <li>Label each sample with its ID number</li>
                <li>Send samples to your local soil testing lab</li>
              </ol>
            </div>
          </div>
          
          {/* Points Table */}
          <div className="bg-card border rounded-lg p-4">
            <h4 className="font-medium text-foreground mb-3">GPS Coordinates for Your Sampling Points</h4>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Sample ID</th>
                    <th className="px-3 py-2 text-right font-medium text-foreground">Latitude</th>
                    <th className="px-3 py-2 text-right font-medium text-foreground">Longitude</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.results.map((point: any) => (
                    <tr key={point.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-sm font-medium">
                          #{point.id}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm text-foreground">
                        {formatCoordinate(point.y, 'lat')}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm text-foreground">
                        {formatCoordinate(point.x, 'lng')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              💡 Tip: Use these coordinates in your GPS device or smartphone GPS app to find each sampling location.
            </div>
          </div>

          {/* Statistics */}
          {results.statistics && (
            <div className="bg-card border rounded-lg p-4">
              <h4 className="font-medium text-foreground mb-3">How Accurate Will Your Sampling Be?</h4>
              <div className="text-sm text-muted-foreground mb-4">
                These numbers show how well your sample points will represent your entire field:
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
                            <span className="text-muted-foreground">Your Sample Average:</span>
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
                      <div className="mt-2 text-xs text-muted-foreground">
                        The closer these numbers are, the better your sampling represents your whole field.
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