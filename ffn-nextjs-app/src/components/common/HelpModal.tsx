'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, HelpCircle } from 'lucide-react'

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Card className="bg-background border shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-foreground flex items-center">
                <HelpCircle className="h-6 w-6 mr-2 text-primary" />
                How to Use FutureFarmNow
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-foreground mb-3 flex items-center">
                  🗺️ Drawing Your Farm Area:
                </h4>
                <ol className="text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                  <li>Look for the drawing tools on the right side of the map</li>
                  <li>Click the square tool for rectangular areas</li>
                  <li>Click the polygon tool for irregular shapes</li>
                  <li>Click on the map to start drawing your area</li>
                  <li>Continue clicking to create the shape</li>
                  <li>Double-click or click the first point to finish</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-3 flex items-center">
                  ✏️ Editing Your Area:
                </h4>
                <ol className="text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                  <li>Click the edit tool (pencil icon) on the map</li>
                  <li>Click on your drawn area to select it</li>
                  <li>Drag the corners to adjust the shape</li>
                  <li>Click "Save" to confirm changes</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-3 flex items-center">
                  🗑️ Removing Areas:
                </h4>
                <ol className="text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                  <li>Click the delete tool (trash icon) on the map</li>
                  <li>Click on the area you want to remove</li>
                  <li>Click "Save" to confirm deletion</li>
                  <li>Or use the "Clear Area" button in the sidebar</li>
                </ol>
              </div>

              <div>
                <h4 className="font-semibold text-foreground mb-3 flex items-center">
                  📊 Analyzing Your Farm:
                </h4>
                <ol className="text-muted-foreground space-y-2 list-decimal list-inside ml-2">
                  <li>Once you've drawn your area, use the tabs in the sidebar</li>
                  <li>Choose "🌱 Soil" to test soil properties</li>
                  <li>Choose "📊 NDVI" to track crop health over time</li>
                  <li>Choose "📍 Sample" to get GPS locations for soil sampling</li>
                </ol>
              </div>

              <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                <p className="font-semibold text-primary mb-2 flex items-center">
                  💡 Pro Tips:
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
                  <li>Draw your area as accurately as possible for better results</li>
                  <li>You can zoom in/out and pan the map while drawing</li>
                  <li>Larger areas take longer to analyze but give more data</li>
                  <li>Use the polygon tool for irregular field shapes</li>
                  <li>Each analysis type provides different insights about your farm</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}