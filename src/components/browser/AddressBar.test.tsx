import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AddressBar } from './AddressBar';

vi.mock('@/stores/useLocaleStore', () => ({
  useLocaleStore: () => ({
    t: {
      browser: {
        back: 'Back',
        forward: 'Forward',
        refresh: 'Refresh',
        home: 'Home',
        addressPlaceholder: 'Search or enter address',
        go: 'Go',
      },
    },
  }),
}));

function renderAddressBar(props?: Partial<React.ComponentProps<typeof AddressBar>>) {
  const onNavigate = vi.fn();
  render(
    <AddressBar
      url="https://lumina.test/current"
      onNavigate={onNavigate}
      onBack={vi.fn()}
      onForward={vi.fn()}
      onRefresh={vi.fn()}
      {...props}
    />,
  );
  return {
    onNavigate,
    input: screen.getByPlaceholderText('Search or enter address') as HTMLInputElement,
  };
}

describe('AddressBar', () => {
  it('navigates directly to explicit http urls', () => {
    const { onNavigate, input } = renderAddressBar();

    fireEvent.change(input, { target: { value: 'http://example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('http://example.com');
    expect(input.value).toBe('http://example.com');
  });

  it('adds https protocol to domain-like input', () => {
    const { onNavigate, input } = renderAddressBar();

    fireEvent.change(input, { target: { value: 'example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('https://example.com');
    expect(input.value).toBe('https://example.com');
  });

  it('turns spaced input into a search query for the selected engine', () => {
    const { onNavigate, input } = renderAddressBar({ searchEngine: 'google' });

    fireEvent.change(input, { target: { value: 'lumina note search' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith(
      'https://www.google.com/search?q=lumina%20note%20search',
    );
  });

  it('treats dotless input as a search query', () => {
    const { onNavigate, input } = renderAddressBar({ searchEngine: 'duckduckgo' });

    fireEvent.change(input, { target: { value: 'lumina' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('https://duckduckgo.com/?q=lumina');
  });

  it('restores the original url on escape without navigating', () => {
    const { onNavigate, input } = renderAddressBar();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'changed query' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onNavigate).not.toHaveBeenCalled();
    expect(input.value).toBe('https://lumina.test/current');
  });
});
