'use client'

import { useState } from 'react'
import { MapContainer } from '@/components/map/MapContainer'
import { Sidebar } from '@/components/panels/Sidebar'
import { HelpModal } from '@/components/common/HelpModal'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMapStore } from '@/lib/stores/mapStore'
import { toast } from '@/lib/utils/toast'

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [helpModalOpen, setHelpModalOpen] = useState(false)
  const { clearArea, clearAllAnalysis } = useMapStore()

  const handleClearArea = () => {
    clearArea()
    toast.success('Area cleared! You can now draw a new area.')
  }

  const handleClearAnalysis = () => {
    clearAllAnalysis()
    toast.success('All analysis results cleared!')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile menu button */}
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-background shadow-md border"
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 transform shadow-lg transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar 
          onClose={() => setSidebarOpen(false)}
          onShowHelp={() => setHelpModalOpen(true)}
          onClearAnalysis={handleClearAnalysis}
        />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-25 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content - Map */}
      <main className="flex-1 relative">
        <MapContainer />
      </main>

      {/* Help Modal - Global */}
      <HelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} />
    </div>
  )
}