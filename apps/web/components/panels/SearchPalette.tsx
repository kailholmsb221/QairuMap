'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Command } from 'cmdk';
import { useBoardStore } from '@/lib/store/boardStore';
import { useUiStore, type Highlight } from '@/lib/store/uiStore';
import { applyHighlight, useSearch } from '@/features/search/useSearch';
import { formatHm } from '@/features/time/derive';
import { IconArrow, IconSearch } from '@/components/chrome/Icons';
import { Dialog, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';

type Item = {
  key: string;
  code: string;
  title: string;
  sub: string;
  tag?: string;
  highlight: Highlight;
};

export function SearchPalette({ tz }: { tz: string }) {
  const t = useTranslations('search');
  const open = useUiStore((s) => s.searchOpen);
  const setOpen = useUiStore((s) => s.setSearchOpen);
  const snapshot = useBoardStore((s) => s.snapshot);
  const { query, setQuery, results, total, loading } = useSearch();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().searchOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open, setQuery]);

  const where = (match: (groups: string[], teacherId: string, room: string, course: string) => boolean) => {
    for (const s of snapshot.now) {
      if (match(s.groups, s.teacher.id, s.roomCode, s.courseCode)) {
        return `${t('onMap')} · ${s.roomCode} ${s.courseTitle} · ${formatHm(s.endAt, tz)}`;
      }
    }
    for (const s of snapshot.next) {
      if (match(s.groups, s.teacher.id, s.roomCode, s.courseCode)) {
        return `${s.roomCode} ${s.courseTitle} · ${formatHm(s.startAt, tz)}`;
      }
    }
    return '';
  };

  const groups: { title: string; items: Item[] }[] = ([
    {
      title: t('groups'),
      items: results.groups.map((g) => ({
        key: `g:${g.id}`,
        code: g.code,
        title: g.program ?? '',
        sub:
          where((gs) => gs.includes(g.code)) ||
          t('groupSub', { program: g.program ?? '', year: g.courseYear ?? '—' }),
        tag: t('onMap'),
        highlight: { kind: 'group' as const, id: g.code, label: g.code },
      })),
    },
    {
      title: t('teachers'),
      items: results.teachers.map((x) => ({
        key: `t:${x.id}`,
        code: x.shortName,
        title: x.department ?? '',
        sub: where((_g, id) => id === x.id) || x.fullName || '',
        highlight: { kind: 'teacher' as const, id: x.id, label: x.shortName },
      })),
    },
    {
      title: t('rooms'),
      items: results.rooms.map((r) => ({
        key: `r:${r.id}`,
        code: r.code,
        title: r.name,
        sub: t('roomSub', { floor: r.floor, type: r.type }),
        highlight: { kind: 'room' as const, id: r.code, label: r.code },
      })),
    },
    {
      title: t('courses'),
      items: results.courses.map((c) => ({
        key: `c:${c.id}`,
        code: c.code,
        title: c.title,
        sub: where((_g, _t, _r, course) => course === c.code) || '',
        highlight: { kind: 'course' as const, id: c.code, label: c.code },
      })),
    },
  ] satisfies { title: string; items: Item[] }[]).filter((g) => g.items.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPortal>
        <DialogOverlay />
        <DialogContent
          data-testid="search-palette"
          aria-describedby={undefined}
          style={{
            right: 'calc(var(--board-w) + var(--gap) + var(--gutter) + 12px)',
            top: 'calc(var(--gutter) + var(--header-h) + var(--gap) + 44px)',
            width: 'min(620px, calc(100vw - 2 * var(--gutter)))',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 14,
            background: 'rgba(17,24,38,.96)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255,255,255,.14)',
            boxShadow: '0 30px 80px rgba(0,0,0,.6)',
            overflow: 'hidden',
          }}
        >
          <DialogTitle
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
            }}
          >
            {t('placeholder')}
          </DialogTitle>
          <Command className="cl-cmdk" shouldFilter={false} loop>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                borderBottom: '1px solid var(--line)',
                color: 'var(--text-dim)',
              }}
            >
              <IconSearch size={20} />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder={t('placeholder')}
                className="mono cl-cmdk-input"
                data-testid="search-input"
              />
              <span
                className="mono"
                style={{
                  fontSize: 'calc(var(--legend-font) - 1px)',
                  padding: '3px 7px',
                  borderRadius: 5,
                  border: '1px solid var(--line)',
                }}
              >
                {t('esc')}
              </span>
            </div>

            <Command.List className="no-scrollbar cl-cmdk-list">
              {query && !loading && total === 0 ? (
                <Command.Empty className="cl-cmdk-empty">{t('empty')}</Command.Empty>
              ) : null}
              {groups.map((g) => (
                <Command.Group key={g.title} heading={g.title}>
                  {g.items.map((item) => (
                    <Command.Item
                      key={item.key}
                      value={item.key}
                      data-testid={`search-item-${item.code}`}
                      onSelect={() => applyHighlight(item.highlight)}
                    >
                      <span className="mono cl-cmdk-code">{item.code}</span>
                      <span className="cl-cmdk-body">
                        <span className="cl-cmdk-title">{item.title}</span>
                        <span className="mono cl-cmdk-sub">{item.sub}</span>
                      </span>
                      {item.tag ? <span className="mono cl-cmdk-tag">{item.tag}</span> : null}
                      <span className="cl-cmdk-arrow">
                        <IconArrow size={16} />
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                padding: '10px 16px',
                borderTop: '1px solid var(--line)',
              }}
            >
              {[t('hintNav'), t('hintPick'), t('hintFilter')].map((h) => (
                <span
                  key={h}
                  className="mono"
                  style={{
                    fontSize: 'calc(var(--legend-font) - 1px)',
                    color: 'var(--text-dim)',
                    letterSpacing: '.04em',
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          </Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
