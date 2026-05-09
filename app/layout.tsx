import type { ReactNode } from 'react';

export const metadata = {
  title: 'Kameokun MVP',
  description: '亀夫君問題WEBサービス MVP',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
