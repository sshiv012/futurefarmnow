'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMapStore } from '@/lib/stores/mapStore'
import { Trash2, MapPin } from 'lucide-react'
import { toast } from 'react-hot-toast'

interface MapControlsProps {
  onClearArea?: () => void
}

export function MapControls({ onClearArea }: MapControlsProps) {
  const { drawnPolygon } = useMapStore()

  const handleClearArea = () => {
    if (onClearArea) {
      onClearArea()
      toast.success('Area cleared! You can now draw a new area.')
    }
  }

  return (
    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
      <Card className="bg-background/95 backdrop-blur shadow-lg border">
        <CardContent className="p-3">
          {/* Status Indicator */}
          <div className="flex items-center justify-center mb-2">
            {drawnPolygon ? (
              <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">Area Selected ✓</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">No area selected</span>
              </div>
            )}
          </div>

          {/* Clear Area Button */}
          {drawnPolygon && (
            <div className="flex items-center justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearArea}
                title="Clear the selected area"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear Area
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}