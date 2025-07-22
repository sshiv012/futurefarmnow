import { create } from 'zustand'
import { GeoJSONGeometry, BoundingBox, SoilLayerEnum } from '@/lib/types/api'
import L from 'leaflet'

interface MapState {
  selectedDataset: string | null
  currentBounds: BoundingBox | null
  drawnPolygon: GeoJSONGeometry | null
  currentZoom: number
  mapInstance: L.Map | null
  drawnItems: L.FeatureGroup | null
  soilImageUrl: string | null
  soilImageBounds: [[number, number], [number, number]] | null
  farmlandGeoJSON: any | null
  selectedSoilLayer: SoilLayerEnum
  selectedSoilDepth: string
  selectedDateRange: {
    from: string
    to: string
  }

  // UI state
  activeTab: 'soil' | 'ndvi' | 'sample'
  isAnalyzing: boolean
  clearTrigger: number // Incremented when clear is triggered

  // Actions
  setSelectedDataset: (dataset: string | null) => void
  setCurrentBounds: (bounds: BoundingBox | null) => void
  setDrawnPolygon: (polygon: GeoJSONGeometry | null) => void
  setCurrentZoom: (zoom: number) => void
  setMapInstance: (map: L.Map | null) => void
  setDrawnItems: (drawnItems: L.FeatureGroup | null) => void
  setSoilImageOverlay: (url: string | null, bounds: [[number, number], [number, number]] | null) => void
  setFarmlandGeoJSON: (geoJSON: any | null) => void
  clearArea: () => void
  clearAllAnalysis: () => void
  setSelectedSoilLayer: (layer: SoilLayerEnum) => void
  setSelectedSoilDepth: (depth: string) => void
  setSelectedDateRange: (range: { from: string; to: string }) => void
  setActiveTab: (tab: 'soil' | 'ndvi' | 'sample') => void
  setIsAnalyzing: (analyzing: boolean) => void
  reset: () => void
}

export const useMapStore = create<MapState>((set, get) => ({
  selectedDataset: 'farmland',
  currentBounds: null,
  drawnPolygon: null,
  currentZoom: 6,
  mapInstance: null,
  drawnItems: null,
  soilImageUrl: null,
  soilImageBounds: null,
  farmlandGeoJSON: null,
  selectedSoilLayer: 'ph',
  selectedSoilDepth: '0-5',
  selectedDateRange: {
    from: '2024-01-01',
    to: '2024-12-31',
  },
  activeTab: 'soil',
  isAnalyzing: false,
  clearTrigger: 0,

  setSelectedDataset: (dataset) => set({ selectedDataset: dataset }),
  setCurrentBounds: (bounds) => set({ currentBounds: bounds }),
  setDrawnPolygon: (polygon) => set({ drawnPolygon: polygon }),
  setCurrentZoom: (zoom) => set({ currentZoom: zoom }),
  setMapInstance: (map) => set({ mapInstance: map }),
  setDrawnItems: (drawnItems) => set({ drawnItems }),
  setSoilImageOverlay: (url, bounds) => set({ soilImageUrl: url, soilImageBounds: bounds }),
  setFarmlandGeoJSON: (geoJSON) => set({ farmlandGeoJSON: geoJSON }),
  clearArea: () => {
    const { drawnItems } = get()
    if (drawnItems) {
      drawnItems.clearLayers()
    }
    set({ drawnPolygon: null, soilImageUrl: null, soilImageBounds: null, farmlandGeoJSON: null })
  },
  clearAllAnalysis: () => {
    const { drawnItems, clearTrigger } = get()
    if (drawnItems) {
      drawnItems.clearLayers()
    }
    set({
      drawnPolygon: null,
      soilImageUrl: null,
      soilImageBounds: null,
      farmlandGeoJSON: null,
      isAnalyzing: false,
      clearTrigger: clearTrigger + 1
    })
  },
  setSelectedSoilLayer: (layer) => set({ selectedSoilLayer: layer }),
  setSelectedSoilDepth: (depth) => set({ selectedSoilDepth: depth }),
  setSelectedDateRange: (range) => set({ selectedDateRange: range }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  reset: () => set({
    selectedDataset: 'farmland',
    currentBounds: null,
    drawnPolygon: null,
    currentZoom: 6,
    mapInstance: null,
    drawnItems: null,
    soilImageUrl: null,
    soilImageBounds: null,
    farmlandGeoJSON: null,
    selectedSoilLayer: 'ph',
    selectedSoilDepth: '0-5',
    selectedDateRange: {
      from: '2024-01-01',
      to: '2024-12-31',
    },
    activeTab: 'soil',
    isAnalyzing: false,
    clearTrigger: 0,
  }),
}))