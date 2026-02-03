import { toast as hotToast } from 'react-hot-toast'
import { X } from 'lucide-react'

export const toast = {
  success: (message: string) => {
    return hotToast.success(
      (t) => (
        <>
          <span>{message}</span>
          <button
            onClick={() => hotToast.dismiss(t.id)}
            className="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ),
      {
        duration: 6000,
      }
    )
  },
  error: (message: string) => {
    return hotToast.error(
      (t) => (
        <>
          <span>{message}</span>
          <button
            onClick={() => hotToast.dismiss(t.id)}
            className="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ),
      {
        duration: 6000,
      }
    )
  },
  info: (message: string) => {
    return hotToast(
      (t) => (
        <>
          <span>{message}</span>
          <button
            onClick={() => hotToast.dismiss(t.id)}
            className="absolute top-2 right-2 p-1 hover:bg-muted rounded-full transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ),
      {
        duration: 6000,
        icon: 'ℹ️',
      }
    )
  },
  loading: (message: string) => {
    return hotToast.loading(message)
  },
  dismiss: (toastId?: string) => {
    return hotToast.dismiss(toastId)
  },
}