import { render, screen } from '@testing-library/react';
import StatisticsPage from '../components/StatisticsPage';

describe('StatisticsPage', () => {
  test('renders the page heading', () => {
    render(<StatisticsPage />);

    expect(screen.getByRole('heading', { name: 'Statistics' })).toBeInTheDocument();
  });
});
