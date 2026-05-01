export const metadata = {
  title: 'Maritime Monitor - Free',
  description: 'Sentinel-2 maritime traffic monitoring with Google Gemini AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0a0f1e', color: '#e2e8f0' }}>
        {children}
      </body>
    </html>
  );
}
