interface VectorInfo {
  id: string
  title: string
  description: string
}

export interface VectorDataResponse {
  vectors: VectorInfo[]
}

export interface GeoJSONGeometry {
  type: 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon' | 'GeometryCollection'
  coordinates: number[] | number[][] | number[][][] | number[][][][]
}

interface GeoJSONFeature {
  type: 'Feature'
  geometry: GeoJSONGeometry
  properties: Record<string, any>
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJSONFeature[]
}

export type SoilLayerEnum =
  | 'alpha' | 'bd' | 'clay' | 'hb' | 'ksat'
  | 'lambda' | 'n' | 'om' | 'ph' | 'sand'
  | 'silt' | 'theta_r' | 'theta_s'

interface Statistics {
  min: number
  max: number
  sum: number
  mean: number
  median: number
  stddev: number
  count: number
  lowerquart: number
  upperquart: number
}

export interface SoilStatsResponse {
  query: Record<string, any>
  results: Statistics
}

interface SoilSamplePoint {
  x: number
  y: number
  id: number
}

export interface SoilSampleResponse {
  query: GeoJSONGeometry
  results: SoilSamplePoint[]
  statistics: {
    layers: Record<string, {
      actual: Statistics
      sample: Statistics
    }>
  }
}

// NDVI Types
interface NDVIDataPoint {
  date: string
  mean: number
}

export interface NDVISinglePolygonResponse {
  query: {
    from: string
    to: string
    geometry: GeoJSONGeometry
  }
  results: NDVIDataPoint[]
}

export interface NDVIMultiPolygonResponse {
  query: Record<string, any>
  results: Array<{
    objectid: string
    results: NDVIDataPoint[]
  }>
}

export interface BoundingBox {
  minx: number
  miny: number
  maxx: number
  maxy: number
}

export interface SoilAnalysisParams {
  soildepth: string
  layer: SoilLayerEnum
  geometry: GeoJSONGeometry
}

export interface NDVIAnalysisParams {
  from: string
  to: string
  geometry: GeoJSONGeometry
}

export interface SoilSampleParams {
  soildepth: string
  layer: SoilLayerEnum[]
  num_points: 5 | 7 | 10 | 12
  geometry: GeoJSONGeometry
}


export interface APIError {
  message: string
  code?: string
  details?: any
}