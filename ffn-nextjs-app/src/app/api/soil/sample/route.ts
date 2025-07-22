import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const soildepth = searchParams.get('soildepth')
    const layer = searchParams.get('layer')
    const num_points = searchParams.get('num_points')

    if (!soildepth || !layer || !num_points) {
      return NextResponse.json(
        { error: 'Missing required parameters: soildepth, layer, num_points' },
        { status: 400 }
      )
    }

    // Get the geometry from request body
    const geometry = await request.json()

    // Forward to the actual API
    const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL}/soil/sample.json?soildepth=${soildepth}&layer=${layer}&num_points=${num_points}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geometry),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Sample API error:', response.status, errorText)
      return NextResponse.json(
        { error: `API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error) {
    console.error('Soil sample proxy error:', error)
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}