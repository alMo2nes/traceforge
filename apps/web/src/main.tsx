import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {
  VscodeInspectorSurface,
  VscodeSidebarSurface,
  VscodeTransactionSurface,
} from './VscodeSurfaces';

const surface = document.body.dataset.traceforgeSurface;

const root = createRoot(document.getElementById('root')!);

function Root() {
  if (surface === 'sidebar') return <VscodeSidebarSurface />;
  if (surface === 'transaction') return <VscodeTransactionSurface />;
  if (surface === 'inspector') return <VscodeInspectorSurface />;
  return <App />;
}

root.render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
