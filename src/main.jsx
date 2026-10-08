import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificacoesProvider } from './components/ui';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <NotificacoesProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </NotificacoesProvider>
    </BrowserRouter>
  </StrictMode>,
);
