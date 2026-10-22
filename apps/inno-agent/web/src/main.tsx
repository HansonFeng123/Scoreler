import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Scoreler } from './scoreler/Scoreler.js';
import './scoreler/scoreler.css';
import '../../../../electron/palettes.css';
createRoot(document.getElementById('root')!).render(<StrictMode><Scoreler /></StrictMode>);
