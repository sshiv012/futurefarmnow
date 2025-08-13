'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/lib/utils/toast'
import Image from 'next/image'

interface NDVITimeSliderProps {
  availableDates: string[]
  currentDate: string
  onDateChange: (date: string) => void
  imageDataUrl?: string
  isLoading?: boolean
  statistics?: Record<string, any>
}

export function NDVITimeSlider({
  availableDates,
  currentDate,
  onDateChange,
  imageDataUrl,
  isLoading = false,
  statistics
}: NDVITimeSliderProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1000) // ms between frames
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const currentIndex = availableDates.indexOf(currentDate)
  const hasValidIndex = currentIndex !== -1

  // Auto-start playing when images are ready
  useEffect(() => {
    if (availableDates.length > 1 && hasValidIndex && imageDataUrl && !isLoading && !isPlaying) {
      // Small delay to ensure everything is loaded
      const autoPlayTimer = setTimeout(() => {
        setIsPlaying(true)
      }, 500)
      
      return () => clearTimeout(autoPlayTimer)
    }
  }, [availableDates.length, hasValidIndex, imageDataUrl, isLoading, isPlaying])

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying && availableDates.length > 1) {
      intervalRef.current = setInterval(() => {
        const currentIdx = availableDates.indexOf(currentDate)
        const nextIndex = (currentIdx + 1) % availableDates.length
        onDateChange(availableDates[nextIndex])
      }, playbackSpeed)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isPlaying, playbackSpeed, availableDates, currentDate, onDateChange])

  const handleSliderChange = (value: number[]) => {
    const newIndex = value[0]
    if (newIndex >= 0 && newIndex < availableDates.length) {
      onDateChange(availableDates[newIndex])
    }
  }

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handlePrevious = () => {
    if (currentIndex > 0) {
      onDateChange(availableDates[currentIndex - 1])
    }
  }

  const handleNext = () => {
    if (currentIndex < availableDates.length - 1) {
      onDateChange(availableDates[currentIndex + 1])
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch (error) {
      return dateString
    }
  }

  const getCurrentStats = () => {
    if (!statistics || !currentDate) return null
    return statistics[currentDate]
  }

  const stats = getCurrentStats()

  if (availableDates.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="text-center text-muted-foreground">
            No NDVI data available for the selected time range
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Calendar className="h-4 w-4" />
          <span>NDVI Time Series Visualization</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Image Display */}
        <div className="relative aspect-square w-full max-w-sm mx-auto bg-muted rounded border">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : imageDataUrl ? (
            <Image
              src={imageDataUrl}
              alt={`NDVI visualization for ${formatDate(currentDate)}`}
              className="w-full h-full object-contain rounded"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Select a date to view NDVI visualization
            </div>
          )}
          
          {/* Date overlay */}
          <div className="absolute bottom-2 left-2 bg-background/90 px-2 py-1 rounded text-xs font-medium">
            {formatDate(currentDate)}
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Mean NDVI</div>
              <div className="font-semibold text-sm">{stats.mean?.toFixed(3) || 'N/A'}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Range</div>
              <div className="font-semibold text-sm">
                {stats.min && stats.max ? `${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}` : 'N/A'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Pixels</div>
              <div className="font-semibold text-sm">{stats.pixels?.toLocaleString() || 'N/A'}</div>
            </div>
          </div>
        )}

        {/* Time Slider */}
        <div className="space-y-3">
          <div className="px-2">
            <Slider
              value={[hasValidIndex ? currentIndex : 0]}
              onValueChange={handleSliderChange}
              max={availableDates.length - 1}
              min={0}
              step={1}
              className="w-full"
              disabled={isLoading}
            />
          </div>
          
          {/* Date Range Labels */}
          <div className="flex justify-between text-xs text-muted-foreground px-2">
            <span>{formatDate(availableDates[0])}</span>
            <span>{formatDate(availableDates[availableDates.length - 1])}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevious}
            disabled={currentIndex <= 0 || isLoading}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handlePlayPause}
            disabled={availableDates.length <= 1 || isLoading}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex >= availableDates.length - 1 || isLoading}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center justify-center space-x-2 text-sm">
          <span className="text-muted-foreground">Speed:</span>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="px-2 py-1 border rounded text-xs"
          >
            <option value={2000}>0.5x</option>
            <option value={1000}>1x</option>
            <option value={500}>2x</option>
            <option value={250}>4x</option>
          </select>
        </div>

        {/* Info */}
        <div className="text-center text-xs text-muted-foreground">
          {hasValidIndex ? `${currentIndex + 1} of ${availableDates.length}` : `0 of ${availableDates.length}`} dates available
        </div>
      </CardContent>
    </Card>
  )
}