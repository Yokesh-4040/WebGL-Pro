import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexProvider, ConvexReactClient } from "convex/react"
import './index.css'
import App from './App.tsx'

// Read the Convex URL from Vite environment variables or fallback to project default
const convexUrl = import.meta.env.VITE_CONVEX_URL || "https://festive-mandrill-69.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
)
