'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatDate } from '@/lib/utils'

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
      
      // Debug logging to verify date parsing
      if (index === 0) {
        console.log('Date parsing check:', {
          rawDate: item.date,
          parsedDate: date,
          isValid: !isNaN(date.getTime()),
          year: date.getFullYear(),
          month: date.getMonth(),
          day: date.getDate(),
          formatted: date.toLocaleDateString(),
          timezone: date.getTimezoneOffset()
        })
      }
      
      // Validate parsed date
      if (isNaN(date.getTime())) {
        console.error('Invalid date found:', item.date)
        return null
      }
      
      const month = date.getMonth() // 0-11
      const dayOfMonth = date.getDate() // 1-31
      // Calculate month progress (0-12, where 0 = Jan 1, 12 = Dec 31)
      const monthProgress = month + (dayOfMonth - 1) / 31
      
      return {
        ...item,
        formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: formatDate(item.date),
        month: month,
        monthProgress: monthProgress,
        monthName: date.toLocaleDateString('en-US', { month: 'short' }),
        value: item.mean
      }
    })
    .filter(item => item !== null) // Remove any invalid dates
}

// Helper function to render a single chart
function renderSingleChart(chartData: any[], color: string, label: string, height: string = "h-64") {
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const currentValue = data.value !== null && data.value !== undefined ? data.value : null
      
      let healthStatus = 'No data'
      let statusColor = '#6b7280'
      
      if (currentValue !== null) {
        healthStatus = currentValue > 0.7 ? 'Excellent' : currentValue > 0.4 ? 'Good' : 'Poor'
        statusColor = currentValue > 0.7 ? '#059669' : currentValue > 0.4 ? '#d97706' : '#dc2626'
      }
      
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 dark:text-gray-100">{data.fullDate}</p>
          <p className="font-medium" style={{ color }}>
            {label}: {currentValue !== null ? currentValue.toFixed(3) : 'No data'}
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
      <div className="mb-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300" style={{ color }}>
          {label}
        </h4>
      </div>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart
          data={chartData}
          margin={{
            top: 10,
            right: 10,
            left: 10,
            bottom: 40,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="monthProgress"
            type="number"
            domain={[0, 12]}
            tickFormatter={(value) => {
              const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
              const monthIndex = Math.floor(value)
              return monthIndex >= 0 && monthIndex < 12 ? monthNames[monthIndex] : ''
            }}
            ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}
            angle={0}
            textAnchor="middle"
            height={40}
            fontSize={11}
            stroke="#6b7280"
          />
          <YAxis
            domain={yAxisDomain}
            tickFormatter={(value) => value.toFixed(2)}
            fontSize={11}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            dot={chartData.length <= 20 ? { fill: color, strokeWidth: 2, r: 4 } : false}
            activeDot={{ r: 6, fill: color, stroke: '#ffffff', strokeWidth: 2 }}
            connectNulls={false}
            strokeLinecap="round"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function TimeSeriesChart({ data, comparisonData, showComparison, primaryLabel, comparisonLabel }: TimeSeriesChartProps) {
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
          "h-56"
        )}
        
        {/* Comparison Chart */}
        {renderSingleChart(
          comparisonChartData, 
          "#3b82f6", 
          comparisonLabel || "Comparison Period",
          "h-56"
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
        "h-64"
      )}
      
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>{data.length} measurements</span>
        <span>
          {primaryChartData[0]?.fullDate} → {primaryChartData[primaryChartData.length - 1]?.fullDate}
        </span>
      </div>
    </div>
  )
}