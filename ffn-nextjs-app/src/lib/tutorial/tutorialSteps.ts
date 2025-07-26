export interface TutorialStep {
  id: string
  title: string
  content: string
  targetSelector: string
  position: 'top' | 'bottom' | 'left' | 'right' | 'center'
  action?: 'click' | 'hover' | 'none'
  waitForElement?: boolean
  nextButtonText?: string
  skipEnabled?: boolean
  autoAction?: {
    type: 'switchTab'
    value: 'soil' | 'ndvi' | 'sample'
  }
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to FutureFarmNow! 🌾',
    content: 'This tool helps you analyze your farm\'s soil health and crop conditions using satellite data. Let\'s take a quick tour to get you started!',
    targetSelector: '.main-container',
    position: 'center',
    action: 'none',
    nextButtonText: 'Start Tour',
    skipEnabled: true
  },
  {
    id: 'sidebar-controls',
    title: 'Sidebar Controls 🎛️',
    content: 'These buttons let you control the sidebar: collapse it to see more map, expand it for more space, and toggle between light/dark themes for comfortable viewing.',
    targetSelector: '[data-tutorial="sidebar-controls"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'map-overview',
    title: 'Your Farm Map 🗺️',
    content: 'This is your interactive farm map. You can zoom in, zoom out, and pan around to see different areas. The map shows farmland boundaries and satellite imagery.',
    targetSelector: '[data-tutorial="map-container"]',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'dataset-selector',
    title: 'Choose Your Region 📍',
    content: 'Select your farming region here. Currently, we support California and Arizona farmlands. Choose the one that matches your farm location.',
    targetSelector: '[data-tutorial="dataset-selector"]',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'drawing-tools',
    title: 'Draw Your Farm Area ✏️',
    content: 'Use these drawing tools to outline your specific farm area on the map. You can see polygon and rectangle tools here.',
    targetSelector: '.leaflet-draw-toolbar',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'polygon-tool',
    title: 'Polygon Drawing Tool 📐',
    content: 'Click this polygon tool to start drawing an irregular shape around your farm. After clicking, you can click points on the map to create your farm boundary.',
    targetSelector: '.leaflet-draw-draw-polygon',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'edit-tool',
    title: 'Edit Your Farm Area ✏️',
    content: 'Use this edit tool to adjust your drawn area. Click it, then click on your polygon to drag corners and reshape your farm boundary.',
    targetSelector: '.leaflet-draw-edit-edit',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'delete-tool',
    title: 'Delete Drawing 🗑️',
    content: 'Click this trash icon to remove your drawn area. You\'ll be able to click on the polygon you want to delete, then confirm by clicking Save.',
    targetSelector: '.leaflet-draw-edit-remove',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'drawing-actions',
    title: 'Save or Cancel Actions 💾',
    content: 'After drawing, editing, or deleting, you\'ll see Save and Cancel buttons here. Click Save to confirm your changes or Cancel to undo them.',
    targetSelector: '.leaflet-draw-actions',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true
  },
  {
    id: 'analysis-tabs',
    title: 'Analysis Options 📊',
    content: 'Choose what you want to analyze: Soil properties (pH, nutrients) or Crop health over time (NDVI) to monitor your farm\'s condition.',
    targetSelector: '[data-tutorial="analysis-tabs"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'soil-analysis',
    title: 'Soil Analysis 🌱',
    content: 'Analyze soil properties like pH, organic matter, and nutrients. Select the soil layer and depth you want to examine, then click "Analyze Soil Properties".',
    targetSelector: '[data-tutorial="soil-panel"]',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true,
    autoAction: {
      type: 'switchTab',
      value: 'soil'
    }
  },
  {
    id: 'soil-layer-selector',
    title: 'Soil Properties 🧪',
    content: 'Choose which soil property to analyze: pH (acidity), organic matter, clay content, sand content, and more. Each affects your crops differently.',
    targetSelector: '[data-tutorial="soil-layer-selector"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'soil-depth-selector',
    title: 'Soil Depth 📏',
    content: 'Select the soil depth to analyze. Different crops have roots at different depths: 0-5cm for seedlings, 15-30cm for established crops.',
    targetSelector: '[data-tutorial="soil-depth-selector"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'analyze-button',
    title: 'Start Analysis 🚀',
    content: 'Click this button to analyze your farm area. The system will process satellite data and show you detailed soil information with colorful maps and statistics.',
    targetSelector: '[data-tutorial="analyze-soil-button"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'zoom-for-farmland-analysis',
    title: 'Zoom In for Farmland Analysis 🔍',
    content: 'Pro tip: If you zoom in close enough (zoom level 12+), a new "Analyze All Farmland in View" button will appear in this button area. This lets you analyze multiple farmlands at once without drawing! Try zooming in slowly with your mouse wheel.',
    targetSelector: '[data-tutorial="soil-analysis-buttons"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'ndvi-analysis',
    title: 'Crop Health Over Time 📈',
    content: 'NDVI shows how healthy and green your crops are over time. Higher values mean healthier, greener crops. You can track changes throughout the growing season.',
    targetSelector: '[data-tutorial="ndvi-panel"]',
    position: 'right',
    action: 'none',
    waitForElement: true,
    skipEnabled: true,
    autoAction: {
      type: 'switchTab',
      value: 'ndvi'
    }
  },
  {
    id: 'date-selector',
    title: 'Time Period Selection 📅',
    content: 'Choose the time period to analyze. You can select a full year or a custom date range to see how your crop health changed over time.',
    targetSelector: '[data-tutorial="date-selector"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'ndvi-farmland-analysis',
    title: 'NDVI Farmland View Analysis 🌾',
    content: 'Just like with soil analysis, if you zoom in close enough, you\'ll see "Analyze All Farmlands in View" button appear here for NDVI too! This lets you compare crop health across multiple farms in your area. Remember: zoom level 12 or higher to unlock this feature.',
    targetSelector: '[data-tutorial="ndvi-analysis-buttons"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'location-button',
    title: 'Find Your Location 📍',
    content: 'Click this button to automatically center the map on your current location. Make sure to allow location access when prompted.',
    targetSelector: '[data-tutorial="location-button"]',
    position: 'right',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'results-interpretation',
    title: 'Understanding Your Results 📋',
    content: 'When analysis is complete, you\'ll see colorful maps, charts, and statistics. Green areas are healthy, red areas may need attention. You can export PDF reports to share.',
    targetSelector: '.main-container',
    position: 'center',
    action: 'none',
    skipEnabled: true
  },
  {
    id: 'help-resources',
    title: 'Need More Help? 💡',
    content: 'Click the Help button anytime for detailed instructions. You can also restart this tutorial from the help menu. Happy farming!',
    targetSelector: '[data-tutorial="help-button"]',
    position: 'right',
    action: 'none',
    nextButtonText: 'Finish Tutorial',
    skipEnabled: true
  }
]

export const getTutorialStep = (stepId: string): TutorialStep | undefined => {
  return tutorialSteps.find(step => step.id === stepId)
}

export const getNextStepId = (currentStepId: string): string | null => {
  const currentIndex = tutorialSteps.findIndex(step => step.id === currentStepId)
  if (currentIndex === -1 || currentIndex === tutorialSteps.length - 1) {
    return null
  }
  return tutorialSteps[currentIndex + 1].id
}

export const getPreviousStepId = (currentStepId: string): string | null => {
  const currentIndex = tutorialSteps.findIndex(step => step.id === currentStepId)
  if (currentIndex <= 0) {
    return null
  }
  return tutorialSteps[currentIndex - 1].id
}