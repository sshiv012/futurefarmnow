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

  // Generate NDVI color gradient stops using the new color scale
  const generateNDVIColorStops = () => {
    const breakpoints = [0.0, 0.07, 0.15, 0.23, 0.3, 0.37, 0.45, 0.51, 0.58, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
    return breakpoints.map(value => ({
      color: ndviToColor(value),
      value: value,
      label: getNDVILabel(value)
    }))
  }

  // Get health label for NDVI value
  const getNDVILabel = (ndvi: number): string => {
    if (ndvi <= 0.07) return 'No Vegetation'
    if (ndvi <= 0.3) return 'Poor'
    if (ndvi <= 0.5) return 'Moderate'
    if (ndvi <= 0.7) return 'Good'
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
      <div className="grid grid-cols-5 gap-1 text-xs">
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-3 h-3 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.03) }}
          />
          <span className="text-gray-600 font-medium text-center">None</span>
          <span className="text-muted-foreground">0.0-0.07</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-3 h-3 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.2) }}
          />
          <span className="text-red-600 font-medium text-center">Poor</span>
          <span className="text-muted-foreground">0.07-0.3</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-3 h-3 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.4) }}
          />
          <span className="text-yellow-600 font-medium text-center">Moderate</span>
          <span className="text-muted-foreground">0.3-0.5</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-3 h-3 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.6) }}
          />
          <span className="text-lime-600 font-medium text-center">Good</span>
          <span className="text-muted-foreground">0.5-0.7</span>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <div 
            className="w-3 h-3 rounded border border-foreground/20"
            style={{ backgroundColor: ndviToColor(0.85) }}
          />
          <span className="text-green-600 font-medium text-center">Excellent</span>
          <span className="text-muted-foreground">0.7-1.0</span>
        </div>
      </div>
      
      <div className="text-xs text-muted-foreground">
        <strong>🗺️ How to read the map:</strong> Gray indicates no vegetation, red shows poor crop health, 
        yellow-orange represents moderate growth, and green shows excellent vegetation health. 
        Darker green indicates denser, healthier crops.
      </div>
    </div>
  )
}