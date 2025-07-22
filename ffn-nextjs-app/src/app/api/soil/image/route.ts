import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const soildepth = searchParams.get('soildepth')
    const layer = searchParams.get('layer')
    
    if (!soildepth || !layer) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    const geometry = await request.json()
    
    const apiUrl = `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://raptor.cs.ucr.edu/futurefarmnow-backend-0.3-RC1'}/soil/image.png?soildepth=${soildepth}&layer=${layer}`
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geometry),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    // Get the image blob
    const imageBlob = await response.blob()
    
    // Return the image with proper headers
    return new NextResponse(imageBlob, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache',
      },
    })
    
  } catch (error) {
    console.error('Soil image proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch soil image' },
      { status: 500 }
    )
  }
}