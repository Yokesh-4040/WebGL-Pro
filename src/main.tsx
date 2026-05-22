import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Initialize Convex client, checking for development environment configuration
const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
const convex = new ConvexReactClient(convexUrl || "https://placeholder-url.convex.cloud");

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App isConvexConfigured={!!convexUrl} />
    </ConvexProvider>
  </React.StrictMode>,
)
