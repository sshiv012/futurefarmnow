'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMapStore } from '@/lib/stores/mapStore'
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { TimeSeriesChart } from '@/components/visualizations/TimeSeriesChart'
import { AlertCircle, Calendar, Download, GitCompare } from 'lucide-react'
import { toast } from 'react-hot-toast'

export function NDVIAnalysis() {
  const {
    selectedDateRange,
    drawnPolygon,
    currentZoom,
    currentBounds,
    selectedDataset,
    setSelectedDateRange,
    clearTrigger
  } = useMapStore()

  const [results, setResults] = useState<any>(null)
  const [comparisonResults, setComparisonResults] = useState<any>(null)
  const [analyzingType, setAnalyzingType] = useState<'polygon' | 'farmland' | null>(null)
  const [comparisonYear, setComparisonYear] = useState<string>('')
  const [isComparison, setIsComparison] = useState(false)


  // Clear state when clearTrigger changes
  useEffect(() => {
    if (clearTrigger > 0) {
      setResults(null)
      setComparisonResults(null)
      setAnalyzingType(null)
      setComparisonYear('')
      setIsComparison(false)
    }
  }, [clearTrigger])

  const ndviAnalysisMutation = useMutation({
    mutationFn: async (params: any) => {
      if (params.isFarmlandAnalysis) {
        return await apiClient.getNDVIForRegion('farmland', params.from, params.to, params.bbox)
      }
      return await apiClient.getNDVIForPolygon(params)
    },
    onSuccess: (data: any) => {
      setResults(data.results || data)
      setAnalyzingType(null)
      const dataCount = data.results?.length || (Array.isArray(data) ? data.length : 0)
      if (dataCount > 0) {
        toast.success(`Found crop health data for ${dataCount} ${data.farmlands ? 'farmlands' : 'time points'}!`)
      } else {
        toast.success('Analysis completed - but no data found for this period')
      }
    },
    onError: (error: any) => {
      setAnalyzingType(null)
      toast.error(error.message || 'Could not get crop health data. Please try again.')
    }
  })

  const canAnalyzeFarmlands = useMemo(() => {
    return selectedDataset === 'farmland' && currentZoom >= 12 && currentBounds
  }, [selectedDataset, currentZoom, currentBounds])

  const handleAnalyzePolygon = () => {
    if (!drawnPolygon) {
      toast.error('Please draw your farm area on the map first! Use the drawing tools on the map.')
      return
    }

    // Clear any farmland results when analyzing polygon
    setResults(null)
    setComparisonResults(null)
    setIsComparison(false)
    setAnalyzingType('polygon')
    const params = {
      from: selectedDateRange.from,
      to: selectedDateRange.to,
      geometry: drawnPolygon
    }
    console.log('NDVI Analysis Params:', { 
      from: params.from, 
      to: params.to,
      selectedDateRange 
    })
    toast('Checking your crop health over time...', { icon: '⏳' })
    ndviAnalysisMutation.mutate(params)
  }

  const handleAnalyzeFarmlands = () => {
    if (!canAnalyzeFarmlands) {
      toast.error('Zoom in further to enable farmland analysis')
      return
    }

    // Clear any polygon results when analyzing farmlands
    setResults(null)
    setComparisonResults(null)
    setIsComparison(false)
    setAnalyzingType('farmland')
    const params = {
      from: selectedDateRange.from,
      to: selectedDateRange.to,
      bbox: currentBounds,
      isFarmlandAnalysis: true
    }
    console.log('NDVI Farmland Analysis Params:', { 
      from: params.from, 
      to: params.to,
      selectedDateRange 
    })
    toast('Analyzing crop health for all farmlands in view...', { icon: '⏳' })
    ndviAnalysisMutation.mutate(params)
  }

  const handleCompareYear = () => {
    if (!comparisonYear || !results) return
    
    // For date ranges, try to match the same time period in the comparison year
    const fromDate = new Date(selectedDateRange.from)
    const toDate = new Date(selectedDateRange.to)
    
    const comparisonFrom = `${comparisonYear}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
    const comparisonTo = `${comparisonYear}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`
    
    const currentYear = new Date(selectedDateRange.from).getFullYear().toString()
    
    console.log('Comparison dates:', { 
      comparisonYear, 
      currentYear,
      selectedDateRange,
      comparisonFrom, 
      comparisonTo 
    })
    
    setAnalyzingType('polygon')
    toast(`Comparing ${currentYear} with ${comparisonYear}...`, { icon: '⏳' })
    
    // Create a separate mutation for comparison
    if (drawnPolygon) {
      apiClient.getNDVIForPolygon({ from: comparisonFrom, to: comparisonTo, geometry: drawnPolygon })
        .then(data => {
          const results = data.results || data
          if (results && results.length > 0) {
            setComparisonResults(results)
            setIsComparison(true)
            setAnalyzingType(null)
            toast.success(`Comparison with ${comparisonYear} loaded! Found ${results.length} data points.`)
          } else {
            setAnalyzingType(null)
            toast.error(`No records found for ${comparisonYear}. Try a different year or check if data is available for that period.`)
          }
        })
        .catch(error => {
          setAnalyzingType(null)
          toast.error(`Failed to load ${comparisonYear} data: ${error.message}`)
        })
    } else if (canAnalyzeFarmlands) {
      apiClient.getNDVIForRegion('farmland', comparisonFrom, comparisonTo, currentBounds || undefined)
        .then(data => {
          const results = data.results || data
          if (results && results.length > 0) {
            setComparisonResults(results)
            setIsComparison(true)
            setAnalyzingType(null)
            toast.success(`Comparison with ${comparisonYear} loaded! Found ${results.length} farmlands.`)
          } else {
            setAnalyzingType(null)
            toast.error(`No farmland records found for ${comparisonYear}. Try a different year or check if data is available for that period.`)
          }
        })
        .catch(error => {
          setAnalyzingType(null)
          toast.error(`Failed to load ${comparisonYear} data: ${error.message}`)
        })
    }
  }

  const handleExportCSV = () => {
    if (!results || results.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      toast('Generating CSV file...', { icon: '⏳' })
      
      // Simple CSV header - only current period data
      let csvContent = 'Date,NDVI Value,Health Status\n'
      
      // Export only current period data
      results.forEach((point: any) => {
        const healthStatus = point.mean > 0.5 ? 'Excellent' : point.mean > 0.2 ? 'Good' : 'Poor'
        csvContent += `${new Date(point.date).toLocaleDateString()},${point.mean.toFixed(3)},${healthStatus}\n`
      })
      
      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `ndvi-data-${selectedDateRange.from}-to-${selectedDateRange.to}-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success('CSV file exported successfully!')
    } catch (error) {
      console.error('CSV export error:', error)
      toast.error('Failed to export CSV file')
    }
  }

  const handleExportPDF = async () => {
    if (!results || results.length === 0) {
      toast.error('No data to export')
      return
    }

    try {
      toast('Generating PDF report...', { icon: '⏳' })
      
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default
      
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      let yPosition = 20
      
      // Title
      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('FutureFarmNow NDVI Analysis Report', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 15
      
      // Analysis details
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.text(`Analysis Period: ${selectedDateRange.from} to ${selectedDateRange.to}`, 20, yPosition)
      yPosition += 8
      pdf.text(`Analysis Date: ${new Date().toLocaleDateString()}`, 20, yPosition)
      yPosition += 8
      const totalDays = Math.ceil((new Date(selectedDateRange.to).getTime() - new Date(selectedDateRange.from).getTime()) / (1000 * 60 * 60 * 24))
      pdf.text(`Duration: ${totalDays} days`, 20, yPosition)
      yPosition += 8
      pdf.text(`Data Points: ${results.length} measurements`, 20, yPosition)
      yPosition += 8
      if (isComparison && comparisonResults) {
        pdf.text(`Comparison Year: ${comparisonYear} (${comparisonResults.length} measurements)`, 20, yPosition)
        yPosition += 8
      }
      yPosition += 7
      
      // Chart
      const chartElement = document.getElementById('ndvi-chart-container')
      if (chartElement) {
        const chartCanvas = await html2canvas(chartElement, {
          backgroundColor: '#ffffff',
          scale: 2,
          logging: false
        })
        const chartImgData = chartCanvas.toDataURL('image/png')
        const chartWidth = pageWidth - 40
        const chartHeight = (chartCanvas.height * chartWidth) / chartCanvas.width
        
        if (yPosition + chartHeight > pageHeight - 20) {
          pdf.addPage()
          yPosition = 20
        }
        
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text('NDVI Time Series Chart:', 20, yPosition)
        yPosition += 10
        
        pdf.addImage(chartImgData, 'PNG', 20, yPosition, chartWidth, chartHeight)
        yPosition += chartHeight + 15
      }
      
      // Statistics
      if (yPosition > pageHeight - 60) {
        pdf.addPage()
        yPosition = 20
      }
      
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Statistical Summary:', 20, yPosition)
      yPosition += 10
      
      const avgHealth = (results.reduce((sum: number, point: any) => sum + point.mean, 0) / results.length).toFixed(3)
      const minHealth = Math.min(...results.map((point: any) => point.mean)).toFixed(3)
      const maxHealth = Math.max(...results.map((point: any) => point.mean)).toFixed(3)
      
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      
      // Primary period statistics
      const primaryPeriod = isComparison ? new Date(selectedDateRange.from).getFullYear().toString() : `${selectedDateRange.from} to ${selectedDateRange.to}`
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text(`${primaryPeriod} Statistics:`, 25, yPosition)
      yPosition += 8
      
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      const stats = [
        `Average NDVI: ${avgHealth}`,
        `Minimum NDVI: ${minHealth}`,
        `Maximum NDVI: ${maxHealth}`,
        `Health Status: ${parseFloat(avgHealth) > 0.5 ? 'Excellent' : parseFloat(avgHealth) > 0.2 ? 'Good' : 'Poor'}`
      ]
      
      stats.forEach(stat => {
        pdf.text(`• ${stat}`, 30, yPosition)
        yPosition += 7
      })
      
      // Comparison statistics if available
      if (isComparison && comparisonResults && comparisonResults.length > 0) {
        yPosition += 5
        const compAvgHealth = (comparisonResults.reduce((sum: number, point: any) => sum + point.mean, 0) / comparisonResults.length).toFixed(3)
        const compMinHealth = Math.min(...comparisonResults.map((point: any) => point.mean)).toFixed(3)
        const compMaxHealth = Math.max(...comparisonResults.map((point: any) => point.mean)).toFixed(3)
        
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text(`${comparisonYear} Comparison Statistics:`, 25, yPosition)
        yPosition += 8
        
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        const compStats = [
          `Average NDVI: ${compAvgHealth}`,
          `Minimum NDVI: ${compMinHealth}`,
          `Maximum NDVI: ${compMaxHealth}`,
          `Health Status: ${parseFloat(compAvgHealth) > 0.5 ? 'Excellent' : parseFloat(compAvgHealth) > 0.2 ? 'Good' : 'Poor'}`
        ]
        
        compStats.forEach(stat => {
          pdf.text(`• ${stat}`, 30, yPosition)
          yPosition += 7
        })
        
        // Comparison analysis
        yPosition += 5
        const avgDiff = (parseFloat(avgHealth) - parseFloat(compAvgHealth)).toFixed(3)
        const improvementText = parseFloat(avgDiff) > 0 ? 'improved' : 'decreased'
        pdf.setFontSize(12)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Year-over-Year Analysis:', 25, yPosition)
        yPosition += 8
        
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        pdf.text(`• Average NDVI ${improvementText} by ${Math.abs(parseFloat(avgDiff)).toFixed(3)} (${(Math.abs(parseFloat(avgDiff)) / parseFloat(compAvgHealth) * 100).toFixed(1)}%)`, 30, yPosition)
        yPosition += 7
      }
      
      // Data table
      yPosition += 10
      if (yPosition > pageHeight - 100) {
        pdf.addPage()
        yPosition = 20
      }
      
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Detailed Measurements:', 20, yPosition)
      yPosition += 10
      
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      
      if (isComparison && comparisonResults) {
        // Table header for comparison
        pdf.text('Date', 25, yPosition)
        pdf.text(`${new Date(selectedDateRange.from).getFullYear()}`, 75, yPosition)
        pdf.text(`${comparisonYear}`, 110, yPosition)
        pdf.text('Difference', 145, yPosition)
        yPosition += 7
        
        // Create a merged dataset for comparison table
        const mergedData = results.map((point: any) => {
          // Match dates by month-day, not exact date (since years are different)
          const pointDate = new Date(point.date)
          const pointMonthDay = `${String(pointDate.getMonth() + 1).padStart(2, '0')}-${String(pointDate.getDate()).padStart(2, '0')}`
          
          const compPoint = comparisonResults.find((comp: any) => {
            const compDate = new Date(comp.date)
            const compMonthDay = `${String(compDate.getMonth() + 1).padStart(2, '0')}-${String(compDate.getDate()).padStart(2, '0')}`
            return compMonthDay === pointMonthDay
          })
          
          return {
            date: point.date,
            current: point.mean,
            comparison: compPoint?.mean,
            difference: compPoint ? (point.mean - compPoint.mean) : null
          }
        })
        
        mergedData.forEach((row: any) => {
          if (yPosition > pageHeight - 20) {
            pdf.addPage()
            yPosition = 20
          }
          
          pdf.text(new Date(row.date).toLocaleDateString(), 25, yPosition)
          pdf.text(row.current.toFixed(3), 75, yPosition)
          pdf.text(row.comparison ? row.comparison.toFixed(3) : 'N/A', 110, yPosition)
          if (row.difference !== null) {
            const diffText = row.difference >= 0 ? `+${row.difference.toFixed(3)}` : row.difference.toFixed(3)
            pdf.text(diffText, 145, yPosition)
          } else {
            pdf.text('N/A', 145, yPosition)
          }
          yPosition += 6
        })
      } else {
        // Table header for single period
        pdf.text('Date', 25, yPosition)
        pdf.text('NDVI Value', 80, yPosition)
        pdf.text('Health Status', 130, yPosition)
        yPosition += 7
        
        // Table data
        results.forEach((point: any) => {
          if (yPosition > pageHeight - 20) {
            pdf.addPage()
            yPosition = 20
          }
          
          const healthStatus = point.mean > 0.5 ? 'Excellent' : point.mean > 0.2 ? 'Good' : 'Poor'
          pdf.text(new Date(point.date).toLocaleDateString(), 25, yPosition)
          pdf.text(point.mean.toFixed(3), 80, yPosition)
          pdf.text(healthStatus, 130, yPosition)
          yPosition += 6
        })
      }
      
      // Footer
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Generated by FutureFarmNow - University of California, Riverside', pageWidth / 2, pageHeight - 10, { align: 'center' })
      
      // Save
      const filename = `ndvi-analysis-${selectedDateRange.from}-to-${selectedDateRange.to}-${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(filename)
      
      toast.success('PDF report exported successfully!')
    } catch (error) {
      console.error('PDF export error:', error)
      toast.error('Failed to export PDF report')
    }
  }

  const handleDateChange = (field: 'from' | 'to', value: string) => {
    setSelectedDateRange({
      ...selectedDateRange,
      [field]: value
    })
  }

  return (
    <div className="p-4 space-y-6">
      {/* Parameters Section */}
      <div className="space-y-4">
        <h3 className="font-medium text-foreground flex items-center">
          <Calendar className="h-4 w-4 mr-2" />
          Track Your Crop Health Over Time
        </h3>

        <div className="text-sm text-muted-foreground mb-4">
          NDVI (Normalized Difference Vegetation Index) measures vegetation health using satellite data. Values range -1 to 1: higher = greener/healthier crops.
        </div>

        <div className="space-y-4">
          <div className="flex items-baseline gap-4" data-tutorial="date-selector">
            <label className="text-sm font-medium text-foreground w-20 shrink-0">
              Start Date
            </label>
            <Input
              type="date"
              value={selectedDateRange.from}
              onChange={(e) => handleDateChange('from', e.target.value)}
              max={selectedDateRange.to}
              className="flex-1"
              style={{ height: '40px', padding: '8px 12px', fontSize: '14px', lineHeight: '20px' }}
            />
          </div>
          
          <div className="flex items-baseline gap-4">
            <label className="text-sm font-medium text-foreground w-20 shrink-0">
              End Date
            </label>
            <Input
              type="date"
              value={selectedDateRange.to}
              onChange={(e) => handleDateChange('to', e.target.value)}
              min={selectedDateRange.from}
              className="flex-1"
              style={{ height: '40px', padding: '8px 12px', fontSize: '14px', lineHeight: '20px' }}
            />
          </div>
        </div>

        {/* Date range info */}
        <div className="text-sm bg-muted/30 p-3 rounded-lg border">
          <p className="font-medium text-foreground">
            Selected time period:
          </p>
          <p className="text-muted-foreground mt-1">
            From {new Date(selectedDateRange.from).toLocaleDateString()} to{' '}
            {new Date(selectedDateRange.to).toLocaleDateString()}
          </p>
          <p className="text-muted-foreground">
            Total days: {Math.ceil((new Date(selectedDateRange.to).getTime() - new Date(selectedDateRange.from).getTime()) / (1000 * 60 * 60 * 24))}
          </p>
        </div>
      </div>

      {/* Analysis Buttons */}
      <div className="space-y-3" data-tutorial="ndvi-analysis-buttons">
        {/* Polygon Analysis Button */}
        <div>
          <Button
            onClick={handleAnalyzePolygon}
            disabled={!drawnPolygon || analyzingType === 'farmland'}
            className={`w-full transition-opacity ${analyzingType === 'farmland' ? 'opacity-50' : ''}`}
          >
            {analyzingType === 'polygon' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Analyzing...
              </>
            ) : (
              'Check Crop Health'
            )}
          </Button>
        </div>

        {/* Farmland Analysis Button (conditional) */}
        {canAnalyzeFarmlands && (
          <div>
            <Button
              onClick={handleAnalyzeFarmlands}
              disabled={analyzingType === 'polygon'}
              variant="outline"
              className={`w-full transition-opacity ${analyzingType === 'polygon' ? 'opacity-50' : ''}`}
              data-tutorial="analyze-ndvi-farmland-button"
            >
              {analyzingType === 'farmland' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
                  Analyzing...
                </>
              ) : (
                'Analyze All Farmlands in View'
              )}
            </Button>
          </div>
        )}

        {/* Warning Messages */}
        {!drawnPolygon && !canAnalyzeFarmlands && (
          <div className="mt-2 flex items-start space-x-2 text-amber-600 dark:text-amber-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>Draw a polygon on the map to enable analysis or zoom in further to check all farmlands</p>
          </div>
        )}

        {canAnalyzeFarmlands && (
          <div className="mt-2 flex items-start space-x-2 text-green-600 dark:text-green-400 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>You can draw a specific area or analyze all farmland visible in the current view</p>
          </div>
        )}
      </div>

      {/* Results Section */}
      {results && results.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-green-600" />
              Your Crop Health Over Time
            </h3>
            <div className="flex gap-2">
              <Button
                onClick={handleExportPDF}
                variant="outline"
                size="sm"
                disabled={!results || results.length === 0}
              >
                <Download className="h-4 w-4 mr-1" />
                Export PDF
              </Button>
              <Button
                onClick={() => {
                  setResults(null)
                  setComparisonResults(null)
                  setIsComparison(false)
                }}
                variant="outline"
                size="sm"
              >
                Clear Results
              </Button>
            </div>
          </div>

          <div className="bg-muted/30 p-4 rounded-lg border">
            <div className="mb-3 text-sm text-muted-foreground">
              {comparisonResults ? 'Two charts for easy comparison - current period (green) and comparison year (blue):' : 'Green line shows how healthy your crops were on each date:'}
            </div>
            <div id="ndvi-chart-container">
              <TimeSeriesChart 
                data={results} 
                comparisonData={comparisonResults}
                showComparison={isComparison}
                primaryLabel={isComparison ? new Date(selectedDateRange.from).getFullYear().toString() : undefined}
                comparisonLabel={isComparison ? comparisonYear : undefined}
              />
            </div>
          </div>
          
          <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border-l-4 border-blue-400 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Compare with Another Year</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">Compare your current date range with the same period in a different year</p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  placeholder="2023"
                  value={comparisonYear}
                  onChange={(e) => setComparisonYear(e.target.value)}
                  className="w-24 text-sm"
                  min="2015"
                  max="2035"
                />
                <Button
                  onClick={handleCompareYear}
                  size="sm"
                  disabled={!comparisonYear || comparisonYear === new Date(selectedDateRange.from).getFullYear().toString()}
                >
                  <GitCompare className="h-4 w-4 mr-2" />
                  Compare
                </Button>
              </div>
            </div>
            {isComparison && comparisonResults && (
              <div className="flex items-center justify-between pt-2 border-t border-blue-200 dark:border-blue-800">
                <span className="text-sm text-blue-700 dark:text-blue-300">
                  Comparing {new Date(selectedDateRange.from).getFullYear()} with {comparisonYear} • {comparisonResults.length} data points
                </span>
                <Button
                  onClick={() => {
                    setIsComparison(false)
                    setComparisonResults(null)
                    setComparisonYear('')
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                >
                  Clear Comparison
                </Button>
              </div>
            )}
          </div>

          {/* Summary Statistics */}
          <div className="bg-card p-4 rounded-lg border space-y-4">
            <h4 className="font-medium text-foreground mb-3">Summary of Your Crop Health:</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted/20 p-3 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Measurements Taken:</dt>
                <dd className="text-lg font-semibold text-foreground">{results.length}</dd>
                <div className="text-xs text-muted-foreground mt-1">Number of satellite images analyzed</div>
              </div>

              <div className="bg-muted/20 p-3 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Average Health Score:</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {(results.reduce((sum: number, point: any) => sum + point.mean, 0) / results.length).toFixed(2)}
                </dd>
                <div className="text-xs text-muted-foreground mt-1">Overall crop health (-1.0 to 1.0 scale)</div>
              </div>

              <div className="bg-muted/20 p-3 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Lowest Health Score:</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {Math.min(...results.map((point: any) => point.mean)).toFixed(2)}
                </dd>
                <div className="text-xs text-muted-foreground mt-1">Worst day in the period</div>
              </div>

              <div className="bg-muted/20 p-3 rounded-lg">
                <dt className="text-sm font-medium text-muted-foreground">Highest Health Score:</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {Math.max(...results.map((point: any) => point.mean)).toFixed(2)}
                </dd>
                <div className="text-xs text-muted-foreground mt-1">Best day in the period</div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border-l-4 border-green-400">
              <div className="text-sm text-green-800 dark:text-green-200">
                <strong>Reading your results:</strong>
                <ul className="mt-1 space-y-1 list-disc list-inside">
                  <li>Values above 0.5: Very healthy, lush green crops</li>
                  <li>Values 0.2-0.5: Good crop health, normal growth</li>
                  <li>Values below 0.2: May indicate stress, disease, or poor growth</li>
                  <li>Negative values: Usually bare soil, water, or non-vegetated areas</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-foreground">Daily Health Scores</h4>
              <div className="flex gap-1">
                <Button
                  onClick={handleExportCSV}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={!results || results.length === 0}
                >
                  <Download className="h-3 w-3 mr-1" />
                  CSV
                </Button>
                <Button
                  onClick={() => {
                    setResults(null)
                    setComparisonResults(null)
                    setIsComparison(false)
                  }}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-background sticky top-0 z-10 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground bg-background">Date</th>
                    <th className="px-3 py-2 text-right font-medium text-foreground bg-background">Health Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((point: any, index: number) => {
                    const healthScore = point.mean
                    const healthStatus = healthScore > 0.5 ? 'Excellent' : healthScore > 0.2 ? 'Good' : 'Poor'
                    const statusColor = healthScore > 0.5 ? 'text-green-600' : healthScore > 0.2 ? 'text-yellow-600' : 'text-red-600'

                    return (
                      <tr key={index} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">
                          {new Date(point.date).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-mono font-medium text-foreground">
                              {point.mean.toFixed(2)}
                            </span>
                            <span className={`text-xs ${statusColor}`}>
                              {healthStatus}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {results && results.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <div className="space-y-2">
            <p className="font-medium">No crop health data found</p>
            <p className="text-sm">
              There might be no satellite images available for your selected area and time period.
            </p>
            <p className="text-xs text-muted-foreground/80">
              Try selecting a different date range or check if your farm area is drawn correctly.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}