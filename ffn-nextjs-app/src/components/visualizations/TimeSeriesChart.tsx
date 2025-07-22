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
}

export function TimeSeriesChart({ data, comparisonData, showComparison }: TimeSeriesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No time series data available
      </div>
    )
  }

  const sortedData = data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const sortedComparisonData = comparisonData?.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  const chartData = sortedData.map((item, index) => {
    const date = new Date(item.date)
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    
    let comparisonValue = null
    if (showComparison && sortedComparisonData) {
      const comparisonItem = sortedComparisonData.find(comp => {
        const compDate = new Date(comp.date)
        return compDate.getMonth() === date.getMonth() && compDate.getDate() === date.getDate()
      })
      comparisonValue = comparisonItem?.mean || null
    }
    
    return {
      ...item,
      formattedDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: formatDate(item.date),
      normalizedX: index,
      dayOfYear,
      value: item.mean,
      comparisonValue
    }
  })

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      const healthStatus = data.value > 0.7 ? 'Excellent' : data.value > 0.4 ? 'Good' : 'Poor'
      const statusColor = data.value > 0.7 ? '#059669' : data.value > 0.4 ? '#d97706' : '#dc2626'
      
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 dark:text-gray-100">{data.fullDate}</p>
          <p className="text-green-600 dark:text-green-400">
            <span className="font-medium">Current:</span> {data.value.toFixed(3)}
          </p>
          {showComparison && data.comparisonValue && (
            <p className="text-blue-600 dark:text-blue-400">
              <span className="font-medium">Comparison:</span> {data.comparisonValue.toFixed(3)}
            </p>
          )}
          <p style={{ color: statusColor }}>
            <span className="font-medium">Health:</span> {healthStatus}
          </p>
        </div>
      )
    }
    return null
  }

  const values = chartData.map(d => d.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = (maxValue - minValue) * 0.1
  const yAxisDomain = [
    Math.max(-1, minValue - padding),
    Math.min(1, maxValue + padding)
  ]

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
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
            dataKey="normalizedX"
            type="number"
            domain={[0, chartData.length - 1]}
            tickFormatter={(value) => {
              const item = chartData[Math.round(value)]
              return item ? item.formattedDate : ''
            }}
            ticks={chartData.length > 10 ? 
              chartData.filter((_, i) => i % Math.ceil(chartData.length / 8) === 0).map(d => d.normalizedX) :
              chartData.map(d => d.normalizedX)
            }
            angle={-45}
            textAnchor="end"
            height={60}
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
            stroke="#10b981"
            strokeWidth={3}
            dot={chartData.length <= 20 ? { fill: '#10b981', strokeWidth: 2, r: 4 } : false}
            activeDot={{ r: 6, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
            connectNulls={false}
            strokeLinecap="round"
            name="Current Period"
          />
          {showComparison && (
            <Line
              type="monotone"
              dataKey="comparisonValue"
              stroke="#3b82f6"
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={chartData.length <= 20 ? { fill: '#3b82f6', strokeWidth: 2, r: 4 } : false}
              activeDot={{ r: 6, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
              connectNulls={false}
              strokeLinecap="round"
              name="Comparison Year"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      
      <div className="mt-4 flex justify-between text-xs text-muted-foreground">
        <span>{data.length} measurements</span>
        <span>{chartData[0].fullDate} → {chartData[chartData.length - 1].fullDate}</span>
      </div>
    </div>
  )
}