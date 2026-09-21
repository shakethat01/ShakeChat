import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { GlobalUserContext } from './GlobalUserContext';
import './styles.css';
import './shakechatbot-theme.css';
import './voice-theater.css';
import './user-context.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /><GlobalUserContext /></React.StrictMode>);