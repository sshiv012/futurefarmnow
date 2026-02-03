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

// ETMap Types - Must match backend JobStatus enum in job_manager.py
export type ETMapStatus =
  | 'queued'              // Initial state when job is created
  | 'claimed'             // Worker has claimed the job
  | 'checking_coverage'   // Checking data coverage
  | 'landsat_started'     // Fetching Landsat data
  | 'landsat_done'        // Landsat fetch complete
  | 'landsat_error'       // Landsat fetch failed
  | 'landsat_skipped_covered' // Landsat data already available
  | 'prism_started'       // Fetching PRISM data
  | 'prism_done'          // PRISM fetch complete
  | 'prism_error'         // PRISM fetch failed
  | 'prism_skipped_covered'   // PRISM data already available
  | 'nldas_started'       // Fetching NLDAS data
  | 'nldas_done'          // NLDAS fetch complete
  | 'nldas_error'         // NLDAS fetch failed
  | 'nldas_skipped_covered'   // NLDAS data already available
  | 'success'             // Data collection complete
  | 'calculation_started' // ET calculation in progress
  | 'calculation_complete'// ET calculation finished
  | 'calculation_failed'  // ET calculation failed
  | 'failed'              // General failure

// ET Map TIF statistics (frontend-friendly format)
export interface ETMapStatistics {
  band_name: string
  min: number
  max: number
  mean: number
  median: number
  std: number
  valid_pixels: number
  total_pixels: number
  coverage_percent: number
}

export interface ETMapStatusResponse {
  request_id: string
  status: ETMapStatus
  stage?: string
  message?: string
  error_message?: string  // Backend sends this field for error details
  result_url?: string
  created_at?: string
  updated_at?: string
  request?: {  // Original request data (for shared link restoration)
    geometry: GeoJSONGeometry
    date_from: string
    date_to: string
  }
  statistics?: ETMapStatistics  // TIF file statistics (available when calculation_complete)
}

export interface ETMapSubmitParams {
  geometry: GeoJSONGeometry
  dateFrom: string
  dateTo: string
}

export interface ETMapSubmitResponse {
  request_id: string
  status: ETMapStatus
  message?: string
}