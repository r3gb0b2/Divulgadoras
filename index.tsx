
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Captura erros globais de JS que poderiam fechar o app
window.onerror = function(message, source, lineno, colno, error) {
  console.error("Erro Global detectado:", message, "em", source, ":", lineno);
  return false;
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Erro Crítico: Elemento root não encontrado no HTML.");
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
