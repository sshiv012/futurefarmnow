'use client'

import { ndviToColor } from '@/lib/utils/color'

interface NDVILegendProps {
  min: number
  max: number
}

export function NDVILegend({ min, max }: NDVILegendProps) {
  // Check if min and max are valid numbers
  if (typeof min !== 'number' || typeof max !== 'number' || isNaN(min) || isNaN(max)) {
    return (
      <div className="bg-card p-4 rounded-lg border space-y-3 ndvi-legend">
        <h4 className="font-medium text-foreground text-sm">
          🌱 NDVI Crop Health Scale
        </h4>
        <div className="text-sm text-muted-foreground">
          Loading scale values...
        </div>
      </div>
    )
  }

  // Generate NDVI color gradient stops
  const generateNDVIColorStops = () => {
    const steps = 8
    const colors = []
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1)
      const value = min + (ratio * (max - min))
      colors.push({
        color: ndviToColor(value),
        value: value,
        label: getNDVILabel(value)
      })
    }
    return colors
  }

  // Get health label for NDVI value
  const getNDVILabel = (ndvi: number): string => {
    if (ndvi < 0.2) return 'Poor'
    if (ndvi < 0.5) return 'Moderate'
    return 'Excellent'
  }

  const colorStops = generateNDVIColorStops()

  return (
    <div className="bg-card p-4 rounded-lg border space-y-3 ndvi-legend">
      <h4 className="font-medium text-foreground text-sm">
        🌱 NDVI Crop Health Scale
      </h4>
      
      {/* Color bar */}
      <div className="relative">
        <div 
          className="h-6 rounded border"
          style={{
            background: `linear-gradient(to right, ${colorStops.map(stop => stop.color).join(', ')})`
          }}
        />
        
        {/* Value labels */}
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>{min.toFixed(3)}</span>
          <span className="text-foreground font-medium">
            NDVI Values
          </span>
          <span>{max.toFixed(3)}</span>
        </div>
      </div>
      
      {/* Health status indicators */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-4 h-4 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.1) }}
          />
          <span className="text-red-600 font-medium">Poor</span>
          <span className="text-muted-foreground">0.0 - 0.2</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-4 h-4 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.35) }}
          />
          <span className="text-yellow-600 font-medium">Moderate</span>
          <span className="text-muted-foreground">0.2 - 0.5</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-4 h-4 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.7) }}
          />
          <span className="text-green-600 font-medium">Excellent</span>
          <span className="text-muted-foreground">0.5 - 1.0</span>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground">
        <strong>Legend:</strong> Red indicates poor vegetation health, yellow is moderate, and green shows excellent crop health. 
        Click on farmland boundaries to see detailed time series data.
      </div>
    </div>
  )
}