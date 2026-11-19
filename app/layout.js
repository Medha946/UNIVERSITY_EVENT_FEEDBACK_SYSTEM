import './globals.css';

export const metadata = { title: 'Campus Events & Feedback', description: 'Register for campus events and share feedback.' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
