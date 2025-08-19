import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { App } from './ui/App';
import './index.css';

const envBaseURL = (import.meta as any).env?.VITE_API_URL as string | undefined;
if (envBaseURL) {
  axios.defaults.baseURL = envBaseURL;
} else if (typeof window !== 'undefined' && window.location.port === '5173') {
  axios.defaults.baseURL = 'http://localhost:3000';
}
axios.defaults.timeout = 10000;

const container = document.getElementById('root')!;
createRoot(container).render(<App />);


