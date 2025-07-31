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