import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BoardRow } from './BoardRow';
import { useTimeStore } from '@/features/time/useNow';
import { renderWithIntl } from '@/test/render';
import { NOW_ISO, TZ, session } from '@/test/fixtures';

/** Freeze the shared 1 Hz clock at the demo instant so countdowns are deterministic. */
function freezeClock() {
  act(() => {
    useTimeStore.setState({
      nowMs: new Date(NOW_ISO).getTime(),
      offsetMs: new Date(NOW_ISO).getTime() - Date.now(),
      synced: true,
    });
  });
}

describe('BoardRow', () => {
  beforeEach(freezeClock);
  afterEach(() => act(() => void useTimeStore.setState({ nowMs: 0, synced: false })));

  it('renders the two-line row: time, room, course, title, teacher, groups, end time', () => {
    const { getByRole } = renderWithIntl(<BoardRow session={session()} tz={TZ} />);
    const row = getByRole('row');
    expect(row.textContent).toContain('10:00');
    expect(row.textContent).toContain('213');
    expect(row.textContent).toContain('CS201');
    expect(row.textContent).toContain('Databases');
    expect(row.textContent).toContain('Akhmetov D.');
    expect(row.textContent).toContain('ПО2308, ПО2309');
    expect(row.textContent).toContain('→ 11:50');
  });

  it('LIVE — a running session', () => {
    const { getByRole } = renderWithIntl(<BoardRow session={session({ phase: 'live' })} tz={TZ} />);
    const row = getByRole('row');
    expect(row.getAttribute('data-status')).toBe('live');
    expect(row.querySelector('[data-pill="live"]')?.textContent).toBe('LIVE');
  });

  it('ENDS n MIN — counts down to the end and drops the end time from the sub-line', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow
        session={session({ phase: 'ending', endAt: '2026-09-08T05:50:00Z' })}
        tz={TZ}
      />,
    );
    const row = getByRole('row');
    expect(row.querySelector('[data-pill="ending"]')?.textContent).toBe('ENDS 3 MIN');
    expect(row.textContent).not.toContain('→ 10:50');
  });

  it('IN n MIN — blinks while a session is about to start', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow
        session={session({
          phase: 'soon',
          startAt: '2026-09-08T05:51:00Z',
          endAt: '2026-09-08T06:41:00Z',
        })}
        tz={TZ}
      />,
    );
    const pill = getByRole('row').querySelector('[data-pill="soon"]');
    expect(pill?.textContent).toBe('IN 4 MIN');
    expect(pill?.className).toContain('blink');
  });

  it('STARTS hh:mm — an upcoming session', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow
        session={session({ phase: 'upcoming', startAt: '2026-09-08T06:00:00Z' })}
        tz={TZ}
      />,
    );
    expect(getByRole('row').querySelector('[data-pill="upcoming"]')?.textContent).toBe(
      'STARTS 11:00',
    );
  });

  it('CANCELLED — strikes the title through', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow session={session({ status: 'cancelled', phase: 'cancelled' })} tz={TZ} />,
    );
    const row = getByRole('row');
    expect(row.querySelector('[data-pill="cancelled"]')?.textContent).toBe('CANCELLED');
    const title = row.querySelector<HTMLElement>('[data-testid="row-title"]');
    expect(title?.style.textDecoration).toBe('line-through');
  });

  it('MOVED → room — keeps the row in the original room column', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow
        session={session({ status: 'moved', roomCode: '414', movedFromRoomCode: '412' })}
        tz={TZ}
      />,
    );
    const row = getByRole('row');
    expect(row.getAttribute('data-room')).toBe('412');
    expect(row.querySelector('[data-pill="moved"]')?.textContent).toBe('MOVED → 414');
  });

  it('DELAYED +n — shows the delay the server applied', () => {
    const { getByRole } = renderWithIntl(
      <BoardRow session={session({ status: 'delayed', delayMinutes: 15 })} tz={TZ} />,
    );
    expect(getByRole('row').querySelector('[data-pill="delayed"]')?.textContent).toBe(
      'DELAYED +15',
    );
  });

  it('marks a conflicting session with a warning glyph', () => {
    const { getByRole, getByLabelText } = renderWithIntl(
      <BoardRow session={session({ conflict: true })} tz={TZ} />,
    );
    expect(getByLabelText('Schedule conflict')).toBeTruthy();
    expect(getByRole('row')).toBeTruthy();
  });

  it('exposes table semantics', () => {
    const { getByRole, getAllByRole } = renderWithIntl(<BoardRow session={session()} tz={TZ} />);
    expect(getByRole('row')).toBeTruthy();
    expect(getAllByRole('cell').length).toBe(4);
  });
});
