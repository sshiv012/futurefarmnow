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


// Geospatial utilities
export function formatCoordinate(coord: number, type: 'lat' | 'lng'): string {
  const direction = type === 'lat' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'W')
  return `${Math.abs(coord).toFixed(4)}°${direction}`
}





