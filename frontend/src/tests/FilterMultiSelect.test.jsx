import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterMultiSelect from '../components/FilterMultiSelect';

const OPTIONS = [
  { value: 'a1', label: 'Giro' },
  { value: 'a2', label: 'Tages' },
  { value: 'a3', label: 'Depot' },
];

function renderSelect(overrides = {}) {
  const props = {
    label: 'Account:',
    allLabel: 'All accounts',
    options: OPTIONS,
    selectedValues: [],
    onChange: jest.fn(),
    ...overrides,
  };
  const utils = render(<FilterMultiSelect {...props} />);
  return { ...utils, props };
}

describe('FilterMultiSelect', () => {
  test('closed by default: no checkboxes, button shows allLabel with nothing selected', () => {
    renderSelect();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Account: All accounts' })).toBeInTheDocument();
  });

  test('opening reveals one checkbox per option', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    expect(screen.getByLabelText('Giro')).toBeInTheDocument();
    expect(screen.getByLabelText('Tages')).toBeInTheDocument();
    expect(screen.getByLabelText('Depot')).toBeInTheDocument();
  });

  test('ticking an unselected option calls onChange with the value added', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedValues: ['a1'] });

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    await user.click(screen.getByLabelText('Tages'));

    expect(props.onChange).toHaveBeenCalledWith(['a1', 'a2']);
  });

  test('unticking a selected option calls onChange with it removed', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedValues: ['a1', 'a2'] });

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    await user.click(screen.getByLabelText('Giro'));

    expect(props.onChange).toHaveBeenCalledWith(['a2']);
  });

  test('with nothing selected, the control reads Select all and calls onChange with every option value', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedValues: [] });

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));

    expect(props.onChange).toHaveBeenCalledWith(['a1', 'a2', 'a3']);
  });

  test('with everything selected, the control reads Unselect all and calls onChange with an empty array', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedValues: ['a1', 'a2', 'a3'] });

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    expect(screen.getByRole('button', { name: 'Unselect all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unselect all' }));

    expect(props.onChange).toHaveBeenCalledWith([]);
  });

  test('summary reads the single selected option\'s label at exactly one selection', () => {
    renderSelect({ selectedValues: ['a2'] });

    expect(screen.getByRole('button', { name: 'Account: Tages' })).toBeInTheDocument();
  });

  test('summary reads a count at two or more selections', () => {
    renderSelect({ selectedValues: ['a1', 'a2'] });

    expect(screen.getByRole('button', { name: 'Account: 2 selected' })).toBeInTheDocument();
  });

  test('closes on outside mousedown', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect();
    render(<button type="button">Outside</button>);

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    expect(screen.getByLabelText('Giro')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByLabelText('Giro')).not.toBeInTheDocument();
    expect(props.onChange).not.toHaveBeenCalled();
  });

  test('closes on Escape', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('button', { name: /^Account:/ }));
    expect(screen.getByLabelText('Giro')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Giro')).not.toBeInTheDocument();
  });

  test('renders no Select all control when options is empty', async () => {
    const user = userEvent.setup();
    renderSelect({ options: [] });

    await user.click(screen.getByRole('button', { name: /^Account:/ }));

    expect(screen.queryByRole('button', { name: /Select all|Unselect all/ })).not.toBeInTheDocument();
  });
});
