'use client'

import { Select, SelectOption } from '@/components/ui/select'
import { useMapStore } from '@/lib/stores/mapStore'
import { Database } from 'lucide-react'

// Static dataset options for California and Arizona
const DATASETS = [
  {
    id: 'farmland',
    title: 'California Farmland',
    description: 'California farmland vector dataset',
    state: 'CA'
  },
  {
    id: 'AZ_Farmland',
    title: 'Arizona Farmland', 
    description: 'Arizona farmland vector dataset',
    state: 'AZ'
  }
]

export function DatasetSelector() {
  const { selectedDataset, setSelectedDataset } = useMapStore()

  const selectedDatasetInfo = DATASETS.find(d => d.id === selectedDataset)

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Database className="h-4 w-4 text-muted-foreground" />
        <label className="text-sm font-medium text-foreground">
          Select Dataset
        </label>
      </div>

      <Select
        value={selectedDataset || ''}
        onChange={(e) => setSelectedDataset(e.target.value || null)}
      >
        <SelectOption value="">Select a dataset...</SelectOption>
        {DATASETS.map((dataset) => (
          <SelectOption key={dataset.id} value={dataset.id}>
            {dataset.title}
          </SelectOption>
        ))}
      </Select>

      {selectedDatasetInfo && (
        <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
          <strong>Selected:</strong> {selectedDatasetInfo.description}
        </div>
      )}
    </div>
  )
}