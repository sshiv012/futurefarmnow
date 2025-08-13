'use client'

import { X, ChevronLeft, ChevronRight, HelpCircle, MapPin, Trash2, Maximize2, Minimize2, BookOpen } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { DatasetSelector } from './DatasetSelector'
import { SoilAnalysis } from './SoilAnalysis'
import { NDVIAnalysis } from './NDVIAnalysis'
import { SamplePoints } from './SamplePoints'
import { useMapStore } from '@/lib/stores/mapStore'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onClose?: () => void
  onShowHelp?: () => void
  onClearAnalysis?: () => void
  onStartTutorial?: () => void
}

export function Sidebar({ onClose, onShowHelp, onClearAnalysis, onStartTutorial }: SidebarProps) {
  const { activeTab, setActiveTab, drawnPolygon } = useMapStore()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={cn(
      "h-full flex flex-col bg-background border-r transition-all duration-300 ease-in-out",
      isCollapsed ? "w-16" : isExpanded ? "w-[480px]" : "w-96"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b min-h-[73px]">
        <div className="flex items-center space-x-2 overflow-hidden">
          <div className="text-2xl flex-shrink-0" role="img" aria-label="Farm">
            🌾
          </div>
          {!isCollapsed && (
            <h1 className="text-lg font-semibold text-foreground whitespace-nowrap">
              FutureFarmNow
            </h1>
          )}
        </div>
        <div className="flex items-center space-x-1" data-tutorial="sidebar-controls">
          {!isCollapsed && <ThemeToggle />}

          {/* Desktop expand toggle */}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="hidden md:flex"
              title={isExpanded ? "Contract sidebar" : "Expand sidebar"}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Desktop collapse toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden md:flex"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>

          {/* Mobile close button */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="md:hidden"
              title="Close sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Area Status and Controls - Below Logo */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3 border-b">
          {/* Area Status */}
          <div className="flex items-center justify-center">
            {drawnPolygon ? (
              <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">Area Selected ✓</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="text-sm font-medium">No area selected</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onShowHelp}
              className="flex-1 text-sm"
              data-tutorial="help-button"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Help
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={onClearAnalysis}
              className="w-full text-sm"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Analysis
            </Button>
          </div>

          {/* Tutorial Button */}
          <Button
            variant="default"
            size="sm"
            onClick={onStartTutorial}
            className="w-full text-sm bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600"
          >
            <BookOpen className="h-4 w-4 mr-2" />
            Start Tutorial
          </Button>
        </div>
      )}

      {/* Collapsed state - only show icons */}
      {isCollapsed ? (
        <div className="flex flex-col items-center py-4 space-y-4">
          {/* Area Status Icon */}
          <div className="flex items-center justify-center" title={drawnPolygon ? "Area Selected" : "No Area Selected"}>
            {drawnPolygon ? (
              <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <MapPin className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onShowHelp}
            title="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button
            variant={activeTab === 'soil' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setActiveTab('soil')}
            title="Soil Analysis"
          >
            🌱
          </Button>
          <Button
            variant={activeTab === 'ndvi' ? 'default' : 'ghost'}
            size="icon"
            onClick={() => setActiveTab('ndvi')}
            title="NDVI Analysis"
          >
            📊
          </Button>
          {/* Sample Points feature temporarily disabled */}
          {false && (
            <Button
              variant={activeTab === 'sample' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setActiveTab('sample')}
              title="Sample Points"
            >
              📍
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Dataset Selection */}
          <div className="p-4 border-b bg-muted/50" data-tutorial="dataset-selector">
            <DatasetSelector />
          </div>

          {/* Analysis Tabs */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b" data-tutorial="analysis-tabs">
              <Tabs className="w-full">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger
                    value="soil"
                    active={activeTab === 'soil'}
                    onClick={() => setActiveTab('soil')}
                  >
                    🌱 Soil
                  </TabsTrigger>
                  <TabsTrigger
                    value="ndvi"
                    active={activeTab === 'ndvi'}
                    onClick={() => setActiveTab('ndvi')}
                  >
                    📊 NDVI
                  </TabsTrigger>
                  {/* Sample Points feature temporarily disabled */}
                  {false && (
                    <TabsTrigger
                      value="sample"
                      active={activeTab === 'sample'}
                      onClick={() => setActiveTab('sample')}
                    >
                      📍 Sample
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              <Tabs>
                <TabsContent value="soil" active={activeTab === 'soil'} data-tutorial="soil-panel">
                  <SoilAnalysis />
                </TabsContent>

                <TabsContent value="ndvi" active={activeTab === 'ndvi'} data-tutorial="ndvi-panel">
                  <NDVIAnalysis />
                </TabsContent>

                <TabsContent value="sample" active={activeTab === 'sample'}>
                  <SamplePoints />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t space-y-3">
            <div className="flex items-center justify-center space-x-3">
              <Image
                src="/UCR_logo.png"
                alt="UC Riverside"
                width={120}
                height={32}
                className="h-8 w-auto"
                priority
              />
              <a
                href="https://ai4sa.ucr.edu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                AI4SA
              </a>
            </div>

            {/* Copyright */}
            <div className="text-center text-xs text-muted-foreground">
              <p>© 2025 FutureFarmNow</p>
              <p>University of California, Riverside</p>
            </div>
          </div>
        </>
      )}

    </div>
  )
}