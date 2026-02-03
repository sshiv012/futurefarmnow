/**
 * Utility functions for sanitizing and escaping HTML content
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 */
export function escapeHtml(str: string | any): string {
  if (str === null || str === undefined) {
    return 'N/A'
  }

  // Convert to string if not already
  const text = String(str)

  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  }

  return text.replace(/[&<>"'`=\/]/g, (char) => htmlEscapeMap[char])
}

/**
 * Formats a number value safely for display
 */
export function formatNumber(value: number | undefined | null, decimals: number = 3): string {
  if (value === null || value === undefined || isNaN(value)) {
    return 'N/A'
  }
  return value.toFixed(decimals)
}

/**
 * Formats a property value for safe display in popups
 */
export function formatPropertyValue(value: any): string {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  if (typeof value === 'number') {
    return formatNumber(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    try {
      return escapeHtml(JSON.stringify(value))
    } catch {
      return 'Complex Object'
    }
  }

  return escapeHtml(String(value))
}

/**
 * Creates safe HTML for popup content
 */
export function createSafePopupContent(data: {
  title?: string
  sections?: Array<{
    title: string
    items: Array<{ label: string; value: any }>
    className?: string
  }>
}): string {
  let html = '<div style="min-width: 200px;">'

  if (data.title) {
    html += `<h4 style="margin: 0 0 8px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 4px;">${escapeHtml(data.title)}</h4>`
  }

  if (data.sections) {
    data.sections.forEach(section => {
      const className = section.className || 'background: #f8f9fa; padding: 8px; border-radius: 4px; margin-bottom: 8px;'
      html += `<div style="${className}">`
      html += `<strong style="color: #2563eb;">${escapeHtml(section.title)}</strong><br>`

      section.items.forEach(item => {
        html += `<strong>${escapeHtml(item.label)}:</strong> ${formatPropertyValue(item.value)}<br>`
      })

      html += '</div>'
    })
  }

  html += '</div>'
  return html
}