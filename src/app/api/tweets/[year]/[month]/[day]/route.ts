import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ year: string; month: string; day: string }> }
) {
  const { year, month, day } = await context.params;

  try {
    const filePath = path.join(
      process.cwd(),
      'src',
      'content',
      'likes',
      year,
      month,
      `${day}.json`,
    );

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const content = JSON.parse(fileContent);

    return NextResponse.json(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}