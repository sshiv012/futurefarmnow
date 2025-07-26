'use client'

import React, { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useTutorial } from '@/lib/contexts/TutorialContext'
import { TutorialStep } from '@/lib/tutorial/tutorialSteps'
import { ChevronLeft, ChevronRight, X, HelpCircle } from 'lucide-react'

interface TutorialPopupProps {
  step: TutorialStep
  highlightArea: { x: number; y: number; width: number; height: number } | null
}

export function TutorialPopup({ step, highlightArea }: TutorialPopupProps) {
  const { progress, nextStep, previousStep, skipTutorial, currentStepId } = useTutorial()

  // Calculate popup position based on step position and highlight area
  const popupStyle = useMemo(() => {
    const popupWidth = 360
    const popupHeight = 280
    const margin = 20
    const sidebarWidth = 384 // 24rem (w-96) default sidebar width

    if (step.position === 'center') {
      return {
        position: 'fixed' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: popupWidth,
        maxWidth: '90vw',
        zIndex: 10001
      }
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // For most steps, position popup to the right of sidebar on the map area
    if (step.position === 'right' || !highlightArea) {
      const mapAreaLeft = sidebarWidth + margin
      const mapAreaWidth = viewportWidth - sidebarWidth - margin * 2
      
      return {
        position: 'fixed' as const,
        top: margin * 2,
        left: mapAreaLeft,
        width: Math.min(popupWidth, mapAreaWidth),
        maxWidth: `${mapAreaWidth}px`,
        zIndex: 10001
      }
    }

    let top = 0
    let left = 0
    let transform = ''

    switch (step.position) {
      case 'top':
        top = Math.max(margin, highlightArea.y - popupHeight - margin)
        left = Math.max(sidebarWidth + margin, highlightArea.x + highlightArea.width / 2 - popupWidth / 2)
        break

      case 'bottom':
        top = Math.min(viewportHeight - popupHeight - margin, highlightArea.y + highlightArea.height + margin)
        left = Math.max(sidebarWidth + margin, highlightArea.x + highlightArea.width / 2 - popupWidth / 2)
        break

      case 'left':
        top = Math.max(margin, highlightArea.y + highlightArea.height / 2 - popupHeight / 2)
        left = Math.max(margin, highlightArea.x - popupWidth - margin)
        
        // If too close to sidebar, position to the right instead
        if (left < sidebarWidth + margin) {
          left = sidebarWidth + margin
        }
        break
    }

    // Ensure popup stays within the map area (to the right of sidebar)
    left = Math.max(sidebarWidth + margin, Math.min(left, viewportWidth - popupWidth - margin))
    top = Math.max(margin, Math.min(top, viewportHeight - popupHeight - margin))

    return {
      position: 'fixed' as const,
      top,
      left,
      width: popupWidth,
      maxWidth: '90vw',
      zIndex: 10001
    }
  }, [step.position, highlightArea])

  const isFirstStep = currentStepId === 'welcome'
  const isLastStep = step.nextButtonText === 'Finish Tutorial'

  return (
    <div
      style={popupStyle}
      className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300"
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-green-500 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <HelpCircle className="h-5 w-5" />
            <h3 className="font-semibold text-lg">{step.title}</h3>
          </div>
          <Button
            onClick={skipTutorial}
            variant="ghost"
            size="sm"
            className="text-white hover:text-gray-200 hover:bg-white/10"
            title="Skip Tutorial"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-sm opacity-90">
            <span>Tutorial Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-white/20" />
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
            {step.content}
          </p>
        </div>

        {/* Action hint */}
        {step.action && step.action !== 'none' && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border-l-4 border-blue-400">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {step.action === 'click' && '💡 Try clicking on the highlighted element'}
              {step.action === 'hover' && '💡 Try hovering over the highlighted element'}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {!isFirstStep && (
            <Button
              onClick={previousStep}
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back</span>
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!isLastStep && (
            <Button
              onClick={skipTutorial}
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Skip Tutorial
            </Button>
          )}
          
          <Button
            onClick={nextStep}
            size="sm"
            className="flex items-center space-x-1 bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600"
          >
            <span>{step.nextButtonText || 'Next'}</span>
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}