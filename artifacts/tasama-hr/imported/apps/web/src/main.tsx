import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@cognirise/atelier/layout';
import { LangProvider } from './lib/i18n';
import { AppState } from './app/state';
import { PresentProvider } from './app/present';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <LangProvider>
      <AppState>
        <PresentProvider>
          <App />
        </PresentProvider>
      </AppState>
    </LangProvider>
  </ThemeProvider>,
);
