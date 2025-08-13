/**
 * Convert a value to a grayscale color based on min/max range
 * @param value The value to convert
 * @param min The minimum value in the range
 * @param max The maximum value in the range
 * @returns RGB color string (white to black gradient - higher values = darker)
 */
export function valueToGrayscale(value: number, min: number, max: number): string {
  const normalized = (value - min) / (max - min)

  // Invert the intensity so higher values = darker colors
  const intensity = Math.round((1 - normalized) * 255)

  // Return as rgb string (equal values = grayscale)
  return `rgb(${intensity}, ${intensity}, ${intensity})`
}

/**
 * Get a color for a specific value with opacity
 * @param value The value to convert
 * @param min The minimum value in the range
 * @param max The maximum value in the range
 * @param opacity The opacity level (0-1)
 * @returns RGBA color string (white to black gradient - higher values = darker)
 */
export function valueToGrayscaleWithOpacity(
  value: number,
  min: number,
  max: number,
  opacity: number = 0.6
): string {
  const normalized = (value - min) / (max - min)
  // Invert the intensity so higher values = darker colors
  const intensity = Math.round((1 - normalized) * 255)
  return `rgba(${intensity}, ${intensity}, ${intensity}, ${opacity})`
}

/**
 * Convert NDVI value to color scheme: Red (poor) -> Yellow (moderate) -> Green (excellent)
 * @param ndvi The NDVI value (-1 to 1, but typically 0 to 1 for vegetation)
 * @returns RGB color string representing vegetation health
 */
export function ndviToColor(ndvi: number): string {
  // Clamp NDVI to valid range
  const clampedNdvi = Math.max(-1, Math.min(1, ndvi))
  
  // Define color thresholds
  if (clampedNdvi < 0.2) {
    // Poor vegetation (0 to 0.2): Red to Orange gradient
    const t = Math.max(0, clampedNdvi) / 0.2 // Normalize 0-0.2 to 0-1
    const red = 255
    const green = Math.round(t * 100) // 0 to 100
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  } else if (clampedNdvi < 0.5) {
    // Moderate vegetation (0.2 to 0.5): Orange to Yellow gradient
    const t = (clampedNdvi - 0.2) / 0.3 // Normalize 0.2-0.5 to 0-1
    const red = 255
    const green = Math.round(100 + t * 155) // 100 to 255
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  } else {
    // Good to excellent vegetation (0.5 to 1): Yellow to Green gradient
    const t = (clampedNdvi - 0.5) / 0.5 // Normalize 0.5-1 to 0-1
    const red = Math.round(255 - t * 255) // 255 to 0
    const green = 255
    const blue = 0
    return `rgb(${red}, ${green}, ${blue})`
  }
}