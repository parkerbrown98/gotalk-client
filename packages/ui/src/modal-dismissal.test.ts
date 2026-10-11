import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useModalDismissal } from './modal-dismissal.ts';

vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('modal dismissal handoff', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the source on iOS and waits for native dismissal before opening the next modal', () => {
    const events: string[] = [];
    const { dismissWithAction, onDismiss } = useModalDismissal(() => events.push('close'));
    dismissWithAction(() => events.push('open'));
    expect(events).toEqual(['close']);
    onDismiss();
    expect(events).toEqual(['close', 'open']);
  });

  it('does not guess when UIKit has finished from an animation timeout', () => {
    vi.useFakeTimers();
    const open = vi.fn();
    const { dismissWithAction, onDismiss } = useModalDismissal(vi.fn());
    dismissWithAction(open);
    vi.advanceTimersByTime(10_000);
    expect(open).not.toHaveBeenCalled();
    onDismiss();
    expect(open).toHaveBeenCalledOnce();
  });

  it('ignores repeated selections while dismissal is pending and runs the first action only once', () => {
    const close = vi.fn();
    const first = vi.fn();
    const second = vi.fn();
    const { dismissWithAction, onDismiss } = useModalDismissal(close);
    dismissWithAction(first);
    dismissWithAction(second);
    expect(close).toHaveBeenCalledOnce();
    onDismiss();
    onDismiss();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('does nothing on ordinary dismissal and can handle later openings', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { dismissWithAction, onDismiss } = useModalDismissal(vi.fn());
    onDismiss();
    dismissWithAction(first);
    onDismiss();
    dismissWithAction(second);
    expect(second).not.toHaveBeenCalled();
    onDismiss();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('keeps the selected action even if the menu selection is cleared while closing', () => {
    let selected: { id: string } | null = { id: 'message-1' };
    const captured = selected;
    const open = vi.fn();
    const { dismissWithAction, onDismiss } = useModalDismissal(() => { selected = null; });
    dismissWithAction(() => open(captured.id));
    expect(selected).toBeNull();
    onDismiss();
    expect(open).toHaveBeenCalledWith('message-1');
  });

  it.each(['android', 'web'] as const)('preserves immediate close-then-action behavior on %s', (os) => {
    Platform.OS = os;
    const events: string[] = [];
    const { dismissWithAction, onDismiss } = useModalDismissal(() => events.push('close'));
    dismissWithAction(() => events.push('open'));
    expect(events).toEqual(['close', 'open']);
    onDismiss();
    expect(events).toEqual(['close', 'open']);
  });

  it('surfaces an action failure without replaying it on another dismissal', () => {
    const error = new Error('Action failed');
    const action = vi.fn(() => { throw error; });
    const { dismissWithAction, onDismiss } = useModalDismissal(vi.fn());
    dismissWithAction(action);
    expect(onDismiss).toThrow(error);
    expect(onDismiss).not.toThrow();
    expect(action).toHaveBeenCalledOnce();
  });
});
