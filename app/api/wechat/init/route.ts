import { NextResponse } from 'next/server';
import { restoreSessionsFromDb } from '@/lib/wechat/manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Запускаем восстановление в фоне
    restoreSessionsFromDb().catch(console.error);
    return NextResponse.json({ message: 'WeChat bots initialization started' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
