'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { TutorialStep, getTutorialStep, getNextStepId, getPreviousStepId, tutorialSteps } from '@/lib/tutorial/tutorialSteps'

interface TutorialContextType {
  isActive: boolean
  currentStepId: string | null
  currentStep: TutorialStep | null
  progress: number
  startTutorial: () => void
  endTutorial: () => void
  nextStep: () => void
  previousStep: () => void
  goToStep: (stepId: string) => void
  skipTutorial: () => void
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined)

interface TutorialProviderProps {
  children: ReactNode
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  const [isActive, setIsActive] = useState(false)
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)

  const currentStep = currentStepId ? getTutorialStep(currentStepId) || null : null
  const progress = currentStepId 
    ? Math.round(((tutorialSteps.findIndex(step => step.id === currentStepId) + 1) / tutorialSteps.length) * 100)
    : 0

  const startTutorial = useCallback(() => {
    setIsActive(true)
    setCurrentStepId(tutorialSteps[0].id)
  }, [])

  const endTutorial = useCallback(() => {
    setIsActive(false)
    setCurrentStepId(null)
    // Save tutorial completion to localStorage
    localStorage.setItem('ffn-tutorial-completed', 'true')
  }, [])

  const nextStep = useCallback(() => {
    if (!currentStepId) return
    
    const nextStepId = getNextStepId(currentStepId)
    if (nextStepId) {
      setCurrentStepId(nextStepId)
    } else {
      endTutorial()
    }
  }, [currentStepId, endTutorial])

  const previousStep = useCallback(() => {
    if (!currentStepId) return
    
    const prevStepId = getPreviousStepId(currentStepId)
    if (prevStepId) {
      setCurrentStepId(prevStepId)
    }
  }, [currentStepId])

  const goToStep = useCallback((stepId: string) => {
    const step = getTutorialStep(stepId)
    if (step) {
      setCurrentStepId(stepId)
      
      // Handle auto actions
      if (step.autoAction?.type === 'switchTab') {
        // We'll trigger this from the tutorial overlay component
        // to access the map store
      }
    }
  }, [])

  const skipTutorial = useCallback(() => {
    endTutorial()
  }, [endTutorial])

  const value: TutorialContextType = {
    isActive,
    currentStepId,
    currentStep,
    progress,
    startTutorial,
    endTutorial,
    nextStep,
    previousStep,
    goToStep,
    skipTutorial
  }

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  )
}

export function useTutorial() {
  const context = useContext(TutorialContext)
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider')
  }
  return context
}

// Hook to check if tutorial has been completed
export function useTutorialStatus() {
  const [hasCompletedTutorial, setHasCompletedTutorial] = useState(false)

  React.useEffect(() => {
    const completed = localStorage.getItem('ffn-tutorial-completed') === 'true'
    setHasCompletedTutorial(completed)
  }, [])

  const markTutorialCompleted = () => {
    localStorage.setItem('ffn-tutorial-completed', 'true')
    setHasCompletedTutorial(true)
  }

  const resetTutorial = () => {
    localStorage.removeItem('ffn-tutorial-completed')
    setHasCompletedTutorial(false)
  }

  return {
    hasCompletedTutorial,
    markTutorialCompleted,
    resetTutorial
  }
}