import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { queryClient } from './lib/queryClient'
import { router } from './app/router'
import { ToastProvider } from './components/ui/Toast'
import { AppProvider } from './context/AppContext'

function App() {
  return (
    <AppProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </AppProvider>
  )
}

export default App