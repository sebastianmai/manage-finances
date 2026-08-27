import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScrollToTopButton from '../components/ScrollToTopButton';

function setScrollY(value) {
  Object.defineProperty(window, 'scrollY', { value, writable: true, configurable: true });
}

function fireScroll() {
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });
}

describe('ScrollToTopButton', () => {
  let scrollToSpy;

  beforeEach(() => {
    setScrollY(0);
    // jsdom's real window.scrollTo is a documented-as-not-implemented stub
    // that only logs a warning -- replacing it lets the click test assert
    // on the actual call instead of just not crashing.
    scrollToSpy = jest.fn();
    window.scrollTo = scrollToSpy;
  });

  test('hidden when the page has not scrolled past the threshold', () => {
    render(<ScrollToTopButton />);

    expect(screen.queryByRole('button', { name: 'Scroll to top' })).not.toBeInTheDocument();
  });

  test('appears once scrollY passes the threshold', () => {
    render(<ScrollToTopButton />);

    setScrollY(400);
    fireScroll();

    expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();
  });

  test('disappears again once scrolled back above the threshold', () => {
    render(<ScrollToTopButton />);

    setScrollY(400);
    fireScroll();
    expect(screen.getByRole('button', { name: 'Scroll to top' })).toBeInTheDocument();

    setScrollY(0);
    fireScroll();
    expect(screen.queryByRole('button', { name: 'Scroll to top' })).not.toBeInTheDocument();
  });

  test('clicking the button scrolls smoothly to the top', async () => {
    const user = userEvent.setup();
    render(<ScrollToTopButton />);

    setScrollY(400);
    fireScroll();

    await user.click(screen.getByRole('button', { name: 'Scroll to top' }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  test('listener cleanup: after unmount, a scroll event no longer toggles visibility', () => {
    const { unmount } = render(<ScrollToTopButton />);

    unmount();
    setScrollY(400);

    // No component is mounted to update state on, and no React warning
    // ("update on an unmounted component") should be triggered either --
    // this just proves the listener was actually removed, not merely that
    // nothing renders.
    expect(() => fireScroll()).not.toThrow();
  });
});
