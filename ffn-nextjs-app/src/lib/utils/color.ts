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
 * Convert NDVI value to color using gray-red-orange-yellow-green scale
 * @param ndvi The NDVI value (0 to 1 for vegetation)
 * @returns RGB color string representing vegetation health
 */
export function ndviToColor(ndvi: number): string {
  // Clamp NDVI to valid range (0 to 1)
  const clampedNdvi = Math.max(0, Math.min(1, ndvi))
  
  // Define color breakpoints and corresponding RGB values
  const breakpoints = [0.0, 0.07, 0.15, 0.23, 0.3, 0.37, 0.45, 0.51, 0.58, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]
  const colors = [
    [128, 128, 128], // Gray (0.0)
    [165, 0, 38],    // Dark red (0.07)
    [215, 48, 39],   // Red (0.15)
    [244, 109, 67],  // Red-orange (0.23)
    [253, 174, 97],  // Orange (0.3)
    [254, 224, 139], // Orange-yellow (0.37)
    [255, 255, 191], // Light yellow (0.45)
    [217, 239, 139], // Yellow-green (0.51)
    [166, 217, 106], // Light green (0.58)
    [102, 189, 99],  // Green (0.65)
    [65, 171, 93],   // Medium green (0.7)
    [35, 139, 69],   // Dark green (0.75)
    [0, 109, 44],    // Very dark green (0.8)
    [0, 90, 50],     // Forest green (0.85)
    [0, 70, 35],     // Deep green (0.9)
    [0, 50, 25],     // Very deep green (0.95)
    [0, 40, 20]      // Darkest green (1.0)
  ]
  
  // Find the appropriate color segment
  let i = 0
  while (i < breakpoints.length - 1 && clampedNdvi > breakpoints[i + 1]) {
    i++
  }
  
  // If exact match, return the color
  if (i === breakpoints.length - 1 || clampedNdvi === breakpoints[i]) {
    const [r, g, b] = colors[i]
    return `rgb(${r}, ${g}, ${b})`
  }
  
  // Interpolate between two colors
  const t = (clampedNdvi - breakpoints[i]) / (breakpoints[i + 1] - breakpoints[i])
  const [r1, g1, b1] = colors[i]
  const [r2, g2, b2] = colors[i + 1]
  
  const r = Math.round(r1 * (1 - t) + r2 * t)
  const g = Math.round(g1 * (1 - t) + g2 * t)
  const b = Math.round(b1 * (1 - t) + b2 * t)
  
  return `rgb(${r}, ${g}, ${b})`
}