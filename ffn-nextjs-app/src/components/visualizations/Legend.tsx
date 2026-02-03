'use client'

interface LegendEntry {
  range: string
  color: string
  label?: string
}

interface LegendProps {
  data: LegendEntry[]
  title?: string
}

export function Legend({ data, title = "Legend" }: LegendProps) {
  if (!data || data.length === 0) {
    return null
  }

  return (
    <div className="bg-white border rounded-lg p-3">
      <h4 className="font-medium text-gray-900 mb-3 text-sm">{title}</h4>
      
      <div className="space-y-2">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center space-x-3">
            <div
              className="w-4 h-4 rounded border"
              style={{ backgroundColor: entry.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-gray-700">
                {entry.range}
              </div>
              {entry.label && (
                <div className="text-xs text-gray-500 truncate">
                  {entry.label}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {data.length > 5 && (
        <div className="mt-3 pt-2 border-t text-xs text-gray-500">
          Showing {data.length} categories
        </div>
      )}
    </div>
  )
}