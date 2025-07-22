import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vectorId = searchParams.get('vectorId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const minx = searchParams.get('minx')
    const miny = searchParams.get('miny')
    const maxx = searchParams.get('maxx')
    const maxy = searchParams.get('maxy')

    if (!vectorId || !from || !to) {
      return NextResponse.json(
        { error: 'Missing required parameters: vectorId, from, to' },
        { status: 400 }
      )
    }

    const params = new URLSearchParams({
      from,
      to,
      ...(minx && { minx }),
      ...(miny && { miny }),
      ...(maxx && { maxx }),
      ...(maxy && { maxy })
    })

    const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/ndvi/${vectorId}.json?${params}`
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('NDVI region API error:', response.status, errorText)
      return NextResponse.json(
        { error: `API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('NDVI region proxy error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}