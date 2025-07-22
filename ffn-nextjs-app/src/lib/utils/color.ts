/**
 * Convert a value to a grayscale color based on min/max range
 * @param value The value to convert
 * @param min The minimum value in the range
 * @param max The maximum value in the range
 * @returns RGB color string (black to white gradient)
 */
export function valueToGrayscale(value: number, min: number, max: number): string {
  const normalized = (value - min) / (max - min)

  const intensity = Math.round(normalized * 255)

  // Return as rgb string (equal values = grayscale)
  return `rgb(${intensity}, ${intensity}, ${intensity})`
}

/**
 * Get a color for a specific value with opacity
 * @param value The value to convert
 * @param min The minimum value in the range
 * @param max The maximum value in the range
 * @param opacity The opacity level (0-1)
 * @returns RGBA color string
 */
export function valueToGrayscaleWithOpacity(
  value: number,
  min: number,
  max: number,
  opacity: number = 0.6
): string {
  const normalized = (value - min) / (max - min)
  const intensity = Math.round(normalized * 255)
  return `rgba(${intensity}, ${intensity}, ${intensity}, ${opacity})`
}