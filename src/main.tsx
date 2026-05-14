/**
 * main.tsx — point d'entrée du client.
 * ------------------------------------
 * Bootstrap React + montage de l'App. La séparation rendering / game state
 * est nette : React gère l'UI et le cycle de vie ; PixiJS (monté par App via
 * GameEngine) gère le rendu du monde ; SocketClient gère le réseau.
 *
 * Inclut un ErrorBoundary pour qu'un crash de rendu n'affiche pas une page
 * blanche, et un écran de chargement initial.
 */

import React, { Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// ─── Garde-fou : capture les erreurs de rendu React ─────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[Warfront] erreur de rendu :', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal-screen">
          <h1>Erreur critique</h1>
          <p>Le client a rencontré un problème inattendu.</p>
          <pre>{this.state.error.message}</pre>
          <button onClick={() => window.location.reload()}>Recharger</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error("Élément #root introuvable dans index.html");
}

createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
