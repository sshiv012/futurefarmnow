import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


// Date formatting utilities

/**
 * Parse YYYY-MM-DD date string without timezone issues
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Format YYYY-MM-DD date string to localized date string without timezone issues
 */
export function formatDateString(dateString: string): string {
  return parseDate(dateString).toLocaleDateString()
}

export function formatDate(date: string | Date): string {
  // If it's a YYYY-MM-DD string, use timezone-safe parsing
  if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseDate(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }
  
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Geospatial utilities
export function formatCoordinate(coord: number, type: 'lat' | 'lng'): string {
  const direction = type === 'lat' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W')
  return `${Math.abs(coord).toFixed(4)}°${direction}`
}

export function calculateBoundingBox(coordinates: number[][]): {
  minx: number
  miny: number
  maxx: number
  maxy: number
} {
  let minx = Infinity
  let miny = Infinity
  let maxx = -Infinity
  let maxy = -Infinity

  coordinates.forEach(([lng, lat]) => {
    minx = Math.min(minx, lng)
    miny = Math.min(miny, lat)
    maxx = Math.max(maxx, lng)
    maxy = Math.max(maxy, lat)
  })

  return { minx, miny, maxx, maxy }
}

// Statistical utilities
export function formatStatistic(value: number, precision: number = 2): string {
  if (Math.abs(value) < 0.01) {
    return value.toExponential(2)
  }
  return value.toFixed(precision)
}

// Validation utilities
export function isValidGeoJSONPolygon(geometry: any): boolean {
  return (
    geometry &&
    geometry.type === 'Polygon' &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    Array.isArray(geometry.coordinates[0]) &&
    geometry.coordinates[0].length >= 4
  )
}

export function isValidDateRange(from: string, to: string): boolean {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  return !isNaN(fromDate.getTime()) && !isNaN(toDate.getTime()) && fromDate <= toDate
}

// Error handling utilities
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return 'An unknown error occurred'
}