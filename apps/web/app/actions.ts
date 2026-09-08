'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/i18n/request';

/** The locale lives in a cookie; there is no locale segment in the URL. */
export async function setLocale(next: string): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, isLocale(next) ? next : DEFAULT_LOCALE, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
