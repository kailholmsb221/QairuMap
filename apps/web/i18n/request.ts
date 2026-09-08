import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['ru', 'kk', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(v: string | undefined | null): v is AppLocale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** Cookie-based locale — no URL prefix, so `/` and `/kiosk` stay stable. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages, timeZone: 'Asia/Almaty' };
});
