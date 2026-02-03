'use client'

import { valueToGrayscale } from '@/lib/utils/color'

interface SoilLegendProps {
  soilLayer: string
  min: number
  max: number
}

export function SoilLegend({ soilLayer, min, max }: SoilLegendProps) {
  // Check if min and max are valid numbers
  if (typeof min !== 'number' || typeof max !== 'number' || isNaN(min) || isNaN(max)) {
    return (
      <div className="bg-card p-4 rounded-lg border space-y-3 soil-legend">
        <h4 className="font-medium text-foreground text-sm">
          Color Scale for {soilLayer}
        </h4>
        <div className="text-sm text-muted-foreground">
          Loading scale values...
        </div>
      </div>
    )
  }

  // Generate color gradient using the same function as the map
  const generateColorStops = () => {
    const steps = 8
    const colors = []
    for (let i = 0; i < steps; i++) {
      const ratio = i / (steps - 1)
      const value = min + (ratio * (max - min))
      colors.push({
        color: valueToGrayscale(value, min, max),
        value: value
      })
    }
    return colors
  }

  const colorStops = generateColorStops()

  return (
    <div className="bg-card p-4 rounded-lg border space-y-3 soil-legend">
      <h4 className="font-medium text-foreground text-sm">
        Color Scale for {soilLayer}
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
          <span>{min.toFixed(2)}</span>
          <span className="text-foreground font-medium">
            {soilLayer.toUpperCase()} Values
          </span>
          <span>{max.toFixed(2)}</span>
        </div>
      </div>
      
      {/* Discrete color stops with values */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {colorStops.filter((_, i) => i % 2 === 0).map((stop, index) => (
          <div key={index} className="flex flex-col items-center space-y-1">
            <div 
              className="w-4 h-4 rounded border border-foreground/20"
              style={{ backgroundColor: stop.color }}
            />
            <span className="text-muted-foreground">
              {stop.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-muted-foreground">
        <strong>Legend:</strong> Lower values appear in white, higher values in black. 
        Use this to interpret the soil map colors above.
      </div>
    </div>
  )
}