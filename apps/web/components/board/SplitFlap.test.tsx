import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_FLIPPING_CELLS, SplitFlap, __resetFlipBudget } from './SplitFlap';

const cells = (root: HTMLElement) => root.querySelectorAll('.flap');
const flipping = (root: HTMLElement) => root.querySelectorAll('.flap[data-flip="true"]');

describe('SplitFlap', () => {
  beforeEach(() => __resetFlipBudget());

  it('renders one fixed-width cell per character', () => {
    const { container } = render(<SplitFlap value="10:00" />);
    expect(cells(container).length).toBe(5);
    expect(container.textContent).toContain('10:00');
  });

  it('halves the width of the narrow separator cells', () => {
    const { container } = render(<SplitFlap value="10:00" cellWidth={14} />);
    const widths = [...cells(container)].map((c) => (c as HTMLElement).style.width);
    expect(widths).toEqual(['14px', '14px', '7px', '14px', '14px']);
  });

  it('does not flip on the first render', () => {
    const { container } = render(<SplitFlap value="226" />);
    expect(flipping(container).length).toBe(0);
  });

  it('flips only the cells whose character changed', () => {
    const { container, rerender } = render(<SplitFlap value="226" />);
    rerender(<SplitFlap value="224" />);
    const flipped = flipping(container);
    expect(flipped.length).toBe(1);
    expect(flipped[0]?.textContent).toContain('4');
    expect(container.querySelectorAll('.flap-half-top').length).toBe(1);
    expect(container.querySelectorAll('.flap-half-bottom').length).toBe(1);
  });

  it('staggers each cell by 25 ms', () => {
    const { container, rerender } = render(<SplitFlap value="000" />);
    rerender(<SplitFlap value="123" />);
    const tops = [...container.querySelectorAll<HTMLElement>('.flap-half-top')];
    expect(tops.map((t) => t.style.animationDelay)).toEqual(['0ms', '25ms', '50ms']);
    const bottoms = [...container.querySelectorAll<HTMLElement>('.flap-half-bottom')];
    expect(bottoms.map((t) => t.style.animationDelay)).toEqual(['90ms', '115ms', '140ms']);
  });

  it('falls back to a fade once the shared flip budget is spent', () => {
    const before = 'A'.repeat(MAX_FLIPPING_CELLS + 6);
    const after = 'B'.repeat(MAX_FLIPPING_CELLS + 6);
    const { container, rerender } = render(<SplitFlap value={before} />);
    rerender(<SplitFlap value={after} />);
    expect(flipping(container).length).toBe(MAX_FLIPPING_CELLS);
    expect(container.querySelectorAll('.flap-fade').length).toBe(6);
  });

  it('keeps the whole value available to assistive tech', () => {
    const { container } = render(<SplitFlap value="10:00" />);
    expect(container.textContent?.startsWith('10:00')).toBe(true);
    expect([...cells(container)].every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
