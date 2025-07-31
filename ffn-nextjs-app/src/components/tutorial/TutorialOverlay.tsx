'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useTutorial } from '@/lib/contexts/TutorialContext'
import { useMapStore } from '@/lib/stores/mapStore'
import { TutorialPopup } from './TutorialPopup'

interface HighlightArea {
  x: number
  y: number
  width: number
  height: number
  borderRadius?: number
}

export function TutorialOverlay() {
  const { isActive, currentStep } = useTutorial()
  const { setActiveTab } = useMapStore()
  const [highlightArea, setHighlightArea] = useState<HighlightArea | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const updateHighlight = useCallback(() => {
    if (!currentStep) return

    const targetElement = document.querySelector(currentStep.targetSelector)
    if (!targetElement) {
      console.warn(`Tutorial target element not found: ${currentStep.targetSelector}`)
      return
    }

    const rect = targetElement.getBoundingClientRect()
    const padding = 8 // Extra space around the element

    setHighlightArea({
      x: rect.left - padding,
      y: rect.top - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      borderRadius: 8
    })
  }, [currentStep])

  useEffect(() => {
    if (isActive && currentStep) {
      // Handle auto actions
      if (currentStep.autoAction?.type === 'switchTab') {
        setActiveTab(currentStep.autoAction.value)
      }
      
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        updateHighlight()
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
      setHighlightArea(null)
    }
  }, [isActive, currentStep, setActiveTab, updateHighlight])

  // Update highlight on window resize
  useEffect(() => {
    if (!isActive) return

    const handleResize = () => {
      updateHighlight()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isActive, currentStep, updateHighlight])

  // Update highlight when DOM changes (for dynamic content)
  useEffect(() => {
    if (!isActive || !currentStep) return

    const observer = new MutationObserver(() => {
      updateHighlight()
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    return () => observer.disconnect()
  }, [isActive, currentStep, updateHighlight])

  if (!isActive || !isVisible) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="tutorial-overlay fixed inset-0 z-[10000] pointer-events-none"
      style={{
        background: 'rgba(0, 0, 0, 0)',
        transition: 'background-color 0.3s ease'
      }}
    >
      {/* Dark overlay with cutout for highlighted element */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
      >
        <defs>
          <mask id="tutorial-mask">
            {/* White background covers everything */}
            <rect width="100%" height="100%" fill="white" />
            {/* Black cutout for the highlighted area */}
            {highlightArea && (
              <rect
                x={highlightArea.x}
                y={highlightArea.y}
                width={highlightArea.width}
                height={highlightArea.height}
                rx={highlightArea.borderRadius}
                ry={highlightArea.borderRadius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Apply the mask to create the cutout effect with lighter overlay */}
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.4)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight border */}
      {highlightArea && (
        <div
          className="absolute border-4 border-blue-500 pointer-events-none animate-pulse"
          style={{
            left: highlightArea.x - 2,
            top: highlightArea.y - 2,
            width: highlightArea.width + 4,
            height: highlightArea.height + 4,
            borderRadius: (highlightArea.borderRadius || 0) + 2,
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.5)',
            transition: 'all 0.3s ease'
          }}
        />
      )}

      {/* Tutorial popup */}
      {currentStep && (
        <div className="pointer-events-auto">
          <TutorialPopup
            step={currentStep}
            highlightArea={highlightArea}
          />
        </div>
      )}

      {/* Prevent body scroll when tutorial is active */}
      <style jsx global>{`
        body.tutorial-active {
          overflow: hidden;
        }
      `}</style>
    </div>
  )
}

// Component to add tutorial-active class to body
export function TutorialBodyClass() {
  const { isActive } = useTutorial()

  useEffect(() => {
    if (isActive) {
      document.body.classList.add('tutorial-active')
    } else {
      document.body.classList.remove('tutorial-active')
    }

    return () => {
      document.body.classList.remove('tutorial-active')
    }
  }, [isActive])

  return null
}