import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://placeholder@o0.ingest.sentry.io/0', // Replace with your Sentry DSN
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

const theme = createTheme({
  palette: {
    primary: { main: '#00C29B' },
    secondary: { main: '#111' },
    background: { default: '#f5f5f5' },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  shape: { borderRadius: 12 },
});

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Component {...pageProps} />
    </ThemeProvider>
  );
}
