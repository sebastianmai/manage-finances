import { screen } from '@testing-library/react';
import Profile from './Profile';
import { renderWithRouter } from '../test-utils';

describe('Profile', () => {
  test('renders a link resolving to /profile', () => {
    renderWithRouter(<Profile theme="light" setTheme={jest.fn()} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/profile');
  });

  test('renders an image with accessible name "Profile"', () => {
    renderWithRouter(<Profile theme="light" setTheme={jest.fn()} />);

    expect(screen.getByRole('img', { name: 'Profile' })).toBeInTheDocument();
  });

  test('theme="dark" applies the inline invert filter', () => {
    renderWithRouter(<Profile theme="dark" setTheme={jest.fn()} />);

    expect(screen.getByRole('img', { name: 'Profile' })).toHaveStyle({
      filter: 'brightness(0) invert(1)',
    });
  });

  test('theme="light" applies no inline filter', () => {
    renderWithRouter(<Profile theme="light" setTheme={jest.fn()} />);

    const img = screen.getByRole('img', { name: 'Profile' });
    expect(img.style.filter).toBe('');
  });

  test('an unrecognized theme also applies no inline filter', () => {
    renderWithRouter(<Profile theme="banana" setTheme={jest.fn()} />);

    const img = screen.getByRole('img', { name: 'Profile' });
    expect(img.style.filter).toBe('');
  });
});
