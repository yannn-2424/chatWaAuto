import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Uncaught Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', background: '#0b0f19', color: '#f87171', minHeight: '100vh', fontFamily: 'sans-serif' }}>
          <div style={{ maxWidth: '600px', margin: '0 auto', background: '#1e293b', padding: '32px', borderRadius: '16px', border: '1px solid #334155' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px', color: '#f43f5e' }}>
              ⚠️ AutoWA Pro Application Error
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '16px', fontSize: '14px', lineHeight: '1.6' }}>
              Terjadi kesalahan saat memuat aplikasi. Silakan tekan tombol di bawah untuk membersihkan cache dan mencoba lagi:
            </p>
            <pre style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', color: '#fb7185', overflowX: 'auto', fontSize: '12px', marginBottom: '20px' }}>
              {this.state.error?.toString()}
            </pre>
            <button
              onClick={() => {
                try { localStorage.clear(); } catch (e) {}
                window.location.reload();
              }}
              style={{ padding: '12px 24px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
            >
              Reset Cache & Reload Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
