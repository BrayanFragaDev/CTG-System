import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificacoesProvider } from './components/ui';
import App from './App';
// Fontes servidas pelo próprio sistema (sem depender do Google Fonts: funciona
// em rede restrita e permite uma política de segurança de conteúdo mais fechada)
import '@fontsource/bitter/latin-500.css';
import '@fontsource/bitter/latin-600.css';
import '@fontsource/bitter/latin-700.css';
import '@fontsource/public-sans/latin-400.css';
import '@fontsource/public-sans/latin-500.css';
import '@fontsource/public-sans/latin-600.css';
import '@fontsource/public-sans/latin-700.css';
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
