'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState } from 'react'
import { ThemeProvider } from '@/lib/contexts/ThemeContext'
import { TutorialProvider } from '@/lib/contexts/TutorialContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <ThemeProvider>
      <TutorialProvider>
        <QueryClientProvider client={queryClient}>
          {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 6000,
            style: {
              background: 'hsl(var(--background) / 0.95)',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
              backdropFilter: 'blur(10px)',
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              maxWidth: '400px',
              minWidth: '300px',
              position: 'relative',
              paddingRight: '32px',
            },
            success: {
              iconTheme: {
                primary: 'hsl(var(--primary))',
                secondary: 'hsl(var(--primary-foreground))',
              },
            },
            error: {
              iconTheme: {
                primary: 'hsl(var(--destructive))',
                secondary: 'hsl(var(--destructive-foreground))',
              },
            },
          }}
          gutter={8}
          containerStyle={{
            top: '20px',
            right: '120px',
            left: 'auto',
            zIndex: 9999,
          }}
        />
        </QueryClientProvider>
      </TutorialProvider>
    </ThemeProvider>
  )
}