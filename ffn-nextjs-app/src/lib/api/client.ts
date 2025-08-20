import { AxiosInstance, AxiosResponse } from 'axios'
import axios from 'axios'
import {
  VectorDataResponse,
  GeoJSONFeatureCollection,
  GeoJSONGeometry,
  SoilStatsResponse,
  SoilSampleResponse,
  NDVISinglePolygonResponse,
  NDVIMultiPolygonResponse,
  BoundingBox,
  SoilAnalysisParams,
  NDVIAnalysisParams,
  SoilSampleParams,
  APIError
} from '@/lib/types/api'

class APIClient {
  private client: AxiosInstance

  constructor() {
    const baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://raptor.cs.ucr.edu/futurefarmnow-backend-0.3-RC1'

    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, image/png, */*',
      },
      withCredentials: false,
    })

    this.client.interceptors.request.use(
      (config) => {
        return config
      },
      (error) => Promise.reject(error)
    )

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        const apiError: APIError = {
          message: error.response?.data?.message || error.message || 'An error occurred',
          code: error.response?.status?.toString(),
          details: error.response?.data
        }
        return Promise.reject(apiError)
      }
    )
  }

  async getVectorDatasets(): Promise<VectorDataResponse> {
    const response: AxiosResponse<VectorDataResponse> = await this.client.get('/vectors.json')
    return response.data
  }

  async getVectorDataset(id: string, bbox?: BoundingBox): Promise<GeoJSONFeatureCollection> {
    const params = bbox ? {
      minx: bbox.minx,
      miny: bbox.miny,
      maxx: bbox.maxx,
      maxy: bbox.maxy
    } : undefined

    const response: AxiosResponse<GeoJSONFeatureCollection> = await this.client.get(
      `/vectors/${id}.geojson`,
      { params }
    )
    return response.data
  }

  async getVectorTile(id: string, z: number, x: number, y: number): Promise<Blob> {
    const response: AxiosResponse<Blob> = await this.client.get(
      `/vectors/${id}/tile-${z}-${x}-${y}.png`,
      { responseType: 'blob' }
    )
    return response.data
  }

  async getSoilStatsForPolygon(params: SoilAnalysisParams): Promise<SoilStatsResponse> {
    const queryParams = new URLSearchParams({
      soildepth: params.soildepth,
      layer: params.layer
    })

    const response: AxiosResponse<SoilStatsResponse> = await this.client.post(
      `/soil/singlepolygon.json?${queryParams}`,
      JSON.stringify(params.geometry),
      {
        headers: { 'Content-Type': 'text/plain' }
      }
    )
    return response.data
  }

  async getSoilStatsForRegion(
    vectorId: string,
    soildepth: string,
    layer: string,
    bbox?: BoundingBox
  ): Promise<any> {
    const params = {
      soildepth,
      layer,
      ...bbox
    }

    const response = await this.client.get(`/soil/${vectorId}.json`, { params })
    return response.data
  }

  async getSoilImage(params: SoilAnalysisParams): Promise<Blob> {
    const queryParams = new URLSearchParams({
      soildepth: params.soildepth,
      layer: params.layer
    })

    const response: AxiosResponse<Blob> = await this.client.post(
      `/soil/image.png?${queryParams}`,
      JSON.stringify(params.geometry),
      {
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'blob'
      }
    )
    return response.data
  }

  async getSoilSamplePoints(params: SoilSampleParams): Promise<SoilSampleResponse> {
    // Build query parameters manually to handle multiple layer parameters correctly
    const queryParts = [
      `soildepth=${encodeURIComponent(params.soildepth)}`,
      `num_points=${params.num_points.toString()}`
    ]

    // Add each layer as a separate parameter (e.g., "layer=alpha&layer=clay")
    params.layer.forEach(layer => {
      queryParts.push(`layer=${encodeURIComponent(layer)}`)
    })

    const queryString = queryParts.join('&')

    const response: AxiosResponse<SoilSampleResponse> = await this.client.post(
      `/soil/sample.json?${queryString}`,
      JSON.stringify(params.geometry),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    )
    return response.data
  }

  async getSoilStatsForFarmland(
    soildepth: string,
    layer: string,
    bbox: BoundingBox
  ): Promise<SoilStatsResponse> {
    const params = {
      soildepth,
      layer,
      minx: bbox.minx,
      miny: bbox.miny,
      maxx: bbox.maxx,
      maxy: bbox.maxy
    }

    const response: AxiosResponse<SoilStatsResponse> = await this.client.get(
      '/soil/farmland.json',
      { params }
    )
    return response.data
  }

  async getFarmlandGeoJSON(bbox: BoundingBox): Promise<GeoJSONFeatureCollection> {
    const params = {
      minx: bbox.minx,
      miny: bbox.miny,
      maxx: bbox.maxx,
      maxy: bbox.maxy
    }

    const response: AxiosResponse<GeoJSONFeatureCollection> = await this.client.get(
      '/vectors/farmland.geojson',
      { params }
    )
    return response.data
  }

  async getNDVIForPolygon(params: NDVIAnalysisParams & { source?: string }): Promise<NDVISinglePolygonResponse> {
    const queryParams = new URLSearchParams({
      from: params.from,
      to: params.to,
      ...(params.source && { source: params.source })
    })

    const response: AxiosResponse<NDVISinglePolygonResponse> = await this.client.post(
      `/ndvi/singlepolygon.json?${queryParams}`,
      JSON.stringify(params.geometry),
      {
        headers: { 'Content-Type': 'text/plain' }
      }
    )
    return response.data
  }

  async getNDVIForRegion(
    vectorId: string,
    from: string,
    to: string,
    bbox?: BoundingBox,
    source?: string
  ): Promise<NDVIMultiPolygonResponse> {
    const params = {
      from,
      to,
      ...(bbox && {
        minx: bbox.minx.toString(),
        miny: bbox.miny.toString(),
        maxx: bbox.maxx.toString(),
        maxy: bbox.maxy.toString()
      }),
      ...(source && { source })
    }

    const response: AxiosResponse<NDVIMultiPolygonResponse> = await this.client.get(
      `/ndvi/${vectorId}.json`,
      { params }
    )
    return response.data
  }

  /**
   * Get a single NDVI image as PNG for a specific date
   */
  async getNDVIImage(params: { date: string; geometry: GeoJSONGeometry; source?: string }): Promise<Blob> {
    const queryParams = new URLSearchParams({
      date: params.date,
      ...(params.source && { source: params.source })
    })

    const response: AxiosResponse<Blob> = await this.client.post(
      `/ndvi/image.png?${queryParams}`,
      JSON.stringify(params.geometry),
      {
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'blob'
      }
    )
    return response.data
  }

}

export const apiClient = new APIClient()