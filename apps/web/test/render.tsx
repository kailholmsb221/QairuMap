import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/en.json';

/** Renders a component inside the same i18n provider the app uses. */
export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Almaty">
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  });
}
