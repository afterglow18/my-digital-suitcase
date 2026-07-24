import { createRoot } from 'react-dom/client';
import { initializeRevenueCat } from './lib/revenuecat';
import App from './App';
import './index.css';

// Initialize RevenueCat before first render so configure() has time to
// complete on the native bridge before any paywall is tapped.
// Non-blocking on failure — purchases gracefully show "unavailable" on web.
initializeRevenueCat().catch(console.warn);

createRoot(document.getElementById('root')!).render(<App />);
