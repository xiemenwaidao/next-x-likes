import { readdir } from 'fs/promises';
import { join } from 'path';

export const getTweetIdFromUrl = (url: string): string | null => {
  try {
    // URLから最後の数字部分を抽出
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting status code:', error);
    return null;
  }
};

export async function getContentJsonDateList() {
  const routes = [];

  try {
    // content/likes ディレクトリ内の年ディレクトリを取得
    const contentDir = join(process.cwd(), 'src/content/likes');
    const years = await readdir(contentDir);

    for (const year of years) {
      if (year === '.DS_Store' || !year.match(/^\d{4}$/)) continue; // 年のディレクトリのみ処理

      // 各年の月ディレクトリを取得
      const yearDir = join(contentDir, year);
      const months = await readdir(yearDir);

      for (const month of months) {
        if (month === '.DS_Store' || !month.match(/^\d{1,2}$/)) continue;

        // 各月のJSONファイルを確認
        const monthDir = join(yearDir, month);
        const files = await readdir(monthDir);

        // .jsonファイルのみを処理
        const days = files
          .filter((file) => file.endsWith('.json'))
          .map((file) => file.replace('.json', ''));

        // 実際に存在するファイルに対してのみルートを生成
        for (const day of days) {
          routes.push(`${year}-${month}-${day}`);
        }
      }
    }
  } catch (error) {
    console.error('Error generating routes:', error);
  }

  return routes;
}

// 動的ルートを生成する関数
export async function generateDynamicRoutes() {
  const routes = ['/'];

  try {
    // content/likes ディレクトリ内の年ディレクトリを取得
    const contentDir = join(process.cwd(), 'src/content/likes');
    const years = await readdir(contentDir);

    for (const year of years) {
      if (year === '.DS_Store' || !year.match(/^\d{4}$/)) continue; // 年のディレクトリのみ処理

      // 各年の月ディレクトリを取得
      const yearDir = join(contentDir, year);
      const months = await readdir(yearDir);

      for (const month of months) {
        if (month === '.DS_Store' || !month.match(/^\d{1,2}$/)) continue;

        // 各月のJSONファイルを確認
        const monthDir = join(yearDir, month);
        const files = await readdir(monthDir);

        // .jsonファイルのみを処理
        const days = files
          .filter((file) => file.endsWith('.json'))
          .map((file) => file.replace('.json', ''));

        // 実際に存在するファイルに対してのみルートを生成
        for (const day of days) {
          routes.push(`/${year}/${month}/${day}`);
        }
      }
    }
  } catch (error) {
    console.error('Error generating routes:', error);
  }

  return routes;
}
