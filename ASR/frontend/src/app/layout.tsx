import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JULKAR — AI Transcriber',
  description: 'AI-powered audio transcription with speaker diarization, key topics, and summaries.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('julkar_theme');
                if (t === 'dark') document.documentElement.classList.add('dark');
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
