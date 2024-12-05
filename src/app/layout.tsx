import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { CalendarPicker } from '@/components/calendar-picker';
import { ViewTransitions } from 'next-view-transitions';
import path from 'path';
import { readdir } from 'fs/promises';
import { cache } from 'react';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: '點贊紀錄｜好吧我聽你的',
  description:
    'Xでいいねした投稿を後で見返すためのサイトです。いいねいいねそれいいね。',
};

interface DateInfo {
  year: string;
  month: string;
  day: string;
}

// getAllDatesをcacheで最適化
const getAllDates = cache(async (): Promise<DateInfo[]> => {
  const contentDir = path.join(process.cwd(), 'src/content/likes');

  // 再帰的にJSONファイルを見つける関数
  async function findJsonFiles(dir: string): Promise<string[]> {
    const files = await readdir(dir, { withFileTypes: true });
    const jsonFiles: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          const nestedFiles = await findJsonFiles(fullPath);
          jsonFiles.push(...nestedFiles);
        } else if (file.name.endsWith('.json')) {
          jsonFiles.push(fullPath);
        }
      }),
    );

    return jsonFiles;
  }

  try {
    const jsonFiles = await findJsonFiles(contentDir);

    const dates = jsonFiles
      .map((filePath) => {
        const relativePath = path.relative(contentDir, filePath);
        const pathParts = relativePath.split(path.sep);

        if (pathParts.length < 3) return null;

        return {
          year: pathParts[0],
          month: pathParts[1],
          day: pathParts[2].split('.')[0],
        };
      })
      .filter((date): date is DateInfo => date !== null)
      .sort((a, b) => {
        const dateA = `${a.year}${a.month}${a.day}`;
        const dateB = `${b.year}${b.month}${b.day}`;
        return dateB.localeCompare(dateA);
      });

    return dates;
  } catch (error) {
    console.error('Error reading content directory:', error);
    return [];
  }
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const allDates = await getAllDates();

  return (
    <ViewTransitions>
      <html lang="ja" className="dark">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <div className="container mx-auto min-h-svh">
            <div className="">
              <CalendarPicker allDates={allDates} />
              {children}
            </div>
          </div>
        </body>
      </html>
    </ViewTransitions>
  );
}
