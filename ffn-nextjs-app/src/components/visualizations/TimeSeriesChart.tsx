'use client'

import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SkipBack, SkipForward, Play, Pause } from 'lucide-react'

interface TimeSeriesData {
  date: string
  mean: number
}

interface TimeSeriesChartProps {
  data: TimeSeriesData[]
  comparisonData?: TimeSeriesData[]
  showComparison?: boolean
  primaryLabel?: string
  comparisonLabel?: string
  onDateClick?: (date: string) => void
  selectedDate?: string
  showNavigation?: boolean
  onNavigate?: (direction: 'prev' | 'next') => void
  availableDates?: string[]
  enableAutoPlay?: boolean
}

// Helper function to create chart data from dataset
function createChartData(dataset: TimeSeriesData[]) {
  return dataset.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((item, index) => {
      // Parse YYYY-MM-DD format explicitly to avoid timezone issues
      let date: Date
      if (typeof item.date === 'string' && item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // For YYYY-MM-DD format, create date explicitly to avoid timezone issues
        const [year, month, day] = item.date.split('-').map(Number)
        date = new Date(year, month - 1, day) // month is 0-indexed in Date constructor
      } else {
        // Fallback to standard Date parsing
        date = new Date(item.date)
      }


      // Validate parsed date
      if (isNaN(date.getTime())) {
        return null
      }

      return {
        ...item,
        date: item.date,
        dateObj: date,
        timestamp: date.getTime(),
        formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: formatDate(item.date),
        value: item.mean
      }
    })
    .filter(item => item !== null) // Remove any invalid dates
}

// Helper function to render a single chart
function renderSingleChart(
  chartData: any[],
  color: string,
  label: string,
  height: string = "h-80",
  onDateClick?: (date: string) => void,
  selectedDate?: string
) {
  const values = chartData.map(d => d.value).filter(v => v !== null)

  if (values.length === 0) {
    return (
      <div className={`flex items-center justify-center ${height} text-gray-500 border rounded-lg`}>
        No data available for {label}
      </div>
    )
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = (maxValue - minValue) * 0.1
  const yAxisDomain = [
    Math.max(-1, minValue - padding),
    Math.min(1, maxValue + padding)
  ]

  // Get the actual date range
  const dateRange = chartData.length > 0 ? [
    Math.min(...chartData.map(d => d.timestamp)),
    Math.max(...chartData.map(d => d.timestamp))
  ] : [Date.now(), Date.now()]

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const currentValue = data.value !== null && data.value !== undefined ? data.value : null

      let healthStatus = 'No data'
      let statusColor = '#6b7280'

      if (currentValue !== null) {
        if (currentValue <= 0.07) {
          healthStatus = 'No Vegetation'
          statusColor = '#6b7280' // gray
        } else if (currentValue <= 0.3) {
          healthStatus = 'Poor'
          statusColor = '#dc2626' // red
        } else if (currentValue <= 0.5) {
          healthStatus = 'Moderate'
          statusColor = '#d97706' // yellow/orange
        } else if (currentValue <= 0.7) {
          healthStatus = 'Good'
          statusColor = '#84cc16' // lime
        } else {
          healthStatus = 'Excellent'
          statusColor = '#059669' // green
        }
      }

      return (
        <div className="bg-white dark:bg-gray-800 p-2 border rounded-lg shadow-lg text-sm" style={{ pointerEvents: 'none' }}>
          <p className="font-medium text-gray-900 dark:text-gray-100">{data.fullDate}</p>
          <p className="font-medium" style={{ color }}>
            NDVI: {currentValue !== null ? currentValue.toFixed(3) : 'No data'}
          </p>
          <p style={{ color: statusColor }}>
            <span className="font-medium">Health:</span> {healthStatus}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <div className={`w-full ${height}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 10,
            left: 10,
            bottom: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
          <XAxis
            dataKey="timestamp"
            type="number"
            domain={dateRange}
            tickFormatter={(timestamp) => {
              const date = new Date(timestamp)
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }}
            ticks={chartData.length > 10 ? undefined : chartData.map(d => d.timestamp)}
            angle={-30}
            textAnchor="end"
            height={50}
            fontSize={10}
            stroke="#6b7280"
          />
          <YAxis
            domain={yAxisDomain}
            tickFormatter={(value) => value.toFixed(2)}
            fontSize={9}
            width={25}
          />
          <Tooltip
            content={<CustomTooltip />}
            position={{ y: 0 }}
            allowEscapeViewBox={{ x: false, y: true }}
            wrapperStyle={{ zIndex: 1000 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            dot={chartData.length <= 30 ? ((props: any) => {
              const { cx, cy, payload } = props
              const isSelected = selectedDate === payload.date
              return (
                <g>
                  {/* Invisible larger click area */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={12}
                    fill="transparent"
                    style={{ cursor: onDateClick ? 'pointer' : 'default' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onDateClick && payload && payload.date) {
                        console.log('Dot clicked:', payload.date)
                        onDateClick(payload.date)
                      }
                    }}
                  />
                  {/* Visible dot */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isSelected ? 6 : 4}
                    fill={isSelected ? '#ffffff' : color}
                    stroke={color}
                    strokeWidth={2}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              )
            }) : false}
            activeDot={onDateClick ? ((props: any) => {
              const { cx, cy, payload } = props
              const isSelected = selectedDate === payload.date
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={8}
                  fill={isSelected ? '#ffffff' : color}
                  stroke={color}
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (payload && payload.date) {
                      console.log('Active dot clicked:', payload.date)
                      onDateClick(payload.date)
                    }
                  }}
                />
              )
            }) : false}
            connectNulls={false}
            strokeLinecap="round"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TimeSeriesChart({
  data,
  comparisonData,
  showComparison,
  primaryLabel,
  comparisonLabel,
  onDateClick,
  selectedDate,
  showNavigation,
  onNavigate,
  availableDates,
  enableAutoPlay = false
}: TimeSeriesChartProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1000)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Store refs to avoid re-creating interval on every render
  const selectedDateRef = useRef(selectedDate)
  const onDateClickRef = useRef(onDateClick)
  const availableDatesRef = useRef(availableDates)

  // Update refs when props change
  useEffect(() => {
    selectedDateRef.current = selectedDate
    onDateClickRef.current = onDateClick
    availableDatesRef.current = availableDates
  }, [selectedDate, onDateClick, availableDates])

  // Auto-play functionality
  useEffect(() => {
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (isPlaying && availableDatesRef.current && availableDatesRef.current.length > 1) {
      // Create new interval
      intervalRef.current = setInterval(() => {
        if (selectedDateRef.current && onDateClickRef.current && availableDatesRef.current) {
          const currentIdx = availableDatesRef.current.indexOf(selectedDateRef.current)
          if (currentIdx !== -1) {
            const nextIndex = (currentIdx + 1) % availableDatesRef.current.length
            onDateClickRef.current(availableDatesRef.current[nextIndex])
          }
        }
      }, playbackSpeed)
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPlaying, playbackSpeed])

  // Auto-start playing when enabled (only once when component mounts with data)
  const hasAutoStarted = useRef(false)
  const prevAvailableDatesLength = useRef(0)

  useEffect(() => {
    // Reset hasAutoStarted if availableDates changes (new analysis)
    const currentLength = availableDates?.length || 0
    if (currentLength !== prevAvailableDatesLength.current) {
      hasAutoStarted.current = false
      prevAvailableDatesLength.current = currentLength
    }

    if (enableAutoPlay && availableDates && availableDates.length > 1 && selectedDate && !hasAutoStarted.current) {
      hasAutoStarted.current = true
      const timer = setTimeout(() => {
        setIsPlaying(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [enableAutoPlay, availableDates, selectedDate])

  const handlePlayPause = () => {
    console.log('Play/Pause clicked, current state:', isPlaying, 'changing to:', !isPlaying)
    setIsPlaying(prev => !prev)
  }
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No time series data available
      </div>
    )
  }

  const primaryChartData = createChartData(data)
  const comparisonChartData = comparisonData ? createChartData(comparisonData) : null

  if (showComparison && comparisonChartData) {
    // Render two stacked charts for comparison
    return (
      <div className="w-full space-y-4">
        {/* Primary Chart */}
        {renderSingleChart(
          primaryChartData,
          "#10b981",
          primaryLabel || "Current Period",
          "h-72",
          onDateClick,
          selectedDate
        )}

        {/* Comparison Chart */}
        {renderSingleChart(
          comparisonChartData,
          "#3b82f6",
          comparisonLabel || "Comparison Period",
          "h-72",
          onDateClick,
          selectedDate
        )}

        {/* Combined Footer */}
        <div className="flex justify-between text-xs text-muted-foreground px-4">
          <span>
            {primaryLabel || "Primary"}: {data.length} measurements
          </span>
          <span>
            {comparisonLabel || "Comparison"}: {comparisonData?.length || 0} measurements
          </span>
        </div>
      </div>
    )
  }

  // Render single chart for non-comparison mode
  return (
    <div className="w-full">
      {renderSingleChart(
        primaryChartData,
        "#10b981",
        primaryLabel || "NDVI Over Time",
        "h-96",
        onDateClick,
        selectedDate
      )}

      {/* Navigation and Playback Controls */}
      {showNavigation && onNavigate && (
        <div className="-mt-6 space-y-1">
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate('prev')}
              disabled={!selectedDate}
              className="h-12 w-12 p-0"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={handlePlayPause}
              disabled={!availableDates || availableDates.length <= 1}
              className="h-12 w-12 p-0"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={() => onNavigate('next')}
              disabled={!selectedDate}
              className="h-12 w-12 p-0"
            >
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-2">
            <span>{data.length} measurements</span>
            <span className="font-medium">
              {selectedDate ? formatDate(selectedDate) : 'Select a date'}
            </span>
            <div className="flex items-center space-x-1">
              <span>Speed:</span>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="px-1 py-0.5 border rounded text-xs"
              >
                <option value={2000}>0.5x</option>
                <option value={1000}>1x</option>
                <option value={500}>2x</option>
                <option value={250}>4x</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}