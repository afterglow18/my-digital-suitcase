import { createRoot } from 'react-dom/client';
import { initializeRevenueCat } from './lib/revenuecat';
import { startVisionIndexer } from './lib/visionIndexer';
import App from './App';
import './index.css';

// Initialize RevenueCat before first render so configure() has time to
// complete on the native bridge before any paywall is tapped.
// Non-blocking on failure — purchases gracefully show "unavailable" on web.
initializeRevenueCat().catch(console.warn);

// Start vision indexer after a short delay so the UI renders first.
// Processes any unanalyzed photos in the background for search.
setTimeout(() => {
  startVisionIndexer().catch(console.warn);
}, 2000);

createRoot(document.getElementById('root')!).render(<App />);
