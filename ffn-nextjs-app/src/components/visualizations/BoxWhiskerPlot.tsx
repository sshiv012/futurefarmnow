'use client'

interface BoxWhiskerPlotProps {
  results: {
    min: number
    max: number
    mean: number
    median: number
    lowerquart: number
    upperquart: number
    stddev: number
    count: number
  }
}

export function BoxWhiskerPlot({ results }: BoxWhiskerPlotProps) {
  if (!results || typeof results.min === 'undefined' || isNaN(results.mean) || isNaN(results.median)) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No valid data available for plot
      </div>
    )
  }

  const svgWidth = 320
  const svgHeight = 120
  const plotHeight = 40
  const plotWidth = 240
  const centerY = svgHeight / 2
  const startX = 60
  const endX = startX + plotWidth

  // Calculate positions based on data range
  const range = results.max - results.min
  const scale = range > 0 ? plotWidth / range : 1

  const getXPosition = (value: number) => {
    return startX + ((value - results.min) * scale)
  }

  const minX = getXPosition(results.min)
  const maxX = getXPosition(results.max)
  const medianX = getXPosition(results.median)
  const lowerQuartX = getXPosition(results.lowerquart)
  const upperQuartX = getXPosition(results.upperquart)
  const meanX = getXPosition(results.mean)

  const boxTop = centerY - plotHeight / 4
  const boxBottom = centerY + plotHeight / 4
  const whiskerTop = centerY - plotHeight / 8
  const whiskerBottom = centerY + plotHeight / 8

  return (
    <div className="w-full max-w-sm mx-auto">
      <svg width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mx-auto">
        {/* Whiskers */}
        <line
          x1={minX}
          y1={centerY}
          x2={lowerQuartX}
          y2={centerY}
          stroke="currentColor"
          strokeWidth="2"
          className="text-foreground"
        />
        <line
          x1={maxX}
          y1={centerY}
          x2={upperQuartX}
          y2={centerY}
          stroke="currentColor"
          strokeWidth="2"
          className="text-foreground"
        />

        {/* Min/Max vertical lines */}
        <line
          x1={minX}
          y1={whiskerTop}
          x2={minX}
          y2={whiskerBottom}
          stroke="currentColor"
          strokeWidth="2"
          className="text-foreground"
        />
        <line
          x1={maxX}
          y1={whiskerTop}
          x2={maxX}
          y2={whiskerBottom}
          stroke="currentColor"
          strokeWidth="2"
          className="text-foreground"
        />

        {/* Box */}
        <rect
          x={lowerQuartX}
          y={boxTop}
          width={upperQuartX - lowerQuartX}
          height={plotHeight / 2}
          fill="hsl(var(--primary) / 0.2)"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
        />

        {/* Median line */}
        <line
          x1={medianX}
          y1={boxTop}
          x2={medianX}
          y2={boxBottom}
          stroke="hsl(120, 70%, 40%)"
          strokeWidth="3"
        />

        {/* Mean point */}
        <circle
          cx={meanX}
          cy={centerY}
          r="4"
          fill="hsl(var(--destructive))"
          stroke="hsl(var(--destructive-foreground))"
          strokeWidth="1"
        />

        {/* Value labels */}
        {/* Min/Max at bottom */}
        <text x={minX} y={svgHeight - 5} textAnchor="middle" className="text-xs fill-muted-foreground">
          {results.min.toFixed(2)}
        </text>
        <text x={maxX} y={svgHeight - 5} textAnchor="middle" className="text-xs fill-muted-foreground">
          {results.max.toFixed(2)}
        </text>
        
        {/* Q1/Q3 closer to box edges */}
        <text x={lowerQuartX} y={boxTop - 3} textAnchor="middle" className="text-xs fill-muted-foreground">
          {results.lowerquart.toFixed(2)}
        </text>
        <text x={upperQuartX} y={boxTop - 3} textAnchor="middle" className="text-xs fill-muted-foreground">
          {results.upperquart.toFixed(2)}
        </text>
        
        {/* Mean above, Median below - center aligned */}
        <text x={startX + plotWidth / 2} y={svgHeight - 30} textAnchor="middle" className="text-xs font-medium" fill="hsl(var(--destructive))">
          Mean: {results.mean.toFixed(2)}
        </text>
        
        <text x={startX + plotWidth / 2} y={svgHeight - 15} textAnchor="middle" className="text-xs font-medium" fill="hsl(120, 70%, 40%)">
          Median: {results.median.toFixed(2)}
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-4 text-xs text-muted-foreground space-y-1">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-1" style={{ backgroundColor: 'hsl(120, 70%, 40%)' }}></div>
            <span>Median</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-destructive rounded-full"></div>
            <span>Mean</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-3 bg-primary/20 border border-primary"></div>
            <span>25th-75th Percentile (IQR)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-1 border-t-2 border-foreground"></div>
            <span>Min/Max Range</span>
          </div>
        </div>
      </div>
    </div>
  )
}