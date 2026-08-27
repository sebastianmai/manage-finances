import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountMultiSelect from '../components/AccountMultiSelect';

const ACCOUNTS = [
  { account_id: 'a1', short_name: 'GiroA' },
  { account_id: 'a2', short_name: 'Tages' },
];

function renderSelect(overrides = {}) {
  const props = {
    accounts: ACCOUNTS,
    selectedAccountIds: [],
    onToggleAccount: jest.fn(),
    onSelectedAccountIdsChange: jest.fn(),
    sumSelected: false,
    onSumSelectedChange: jest.fn(),
    ...overrides,
  };
  const utils = render(<AccountMultiSelect {...props} />);
  return { ...utils, props };
}

describe('AccountMultiSelect', () => {
  test('closed by default: no checkboxes in the document, button reads Total with nothing selected', () => {
    renderSelect();

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accounts: Total (all accounts)' })).toBeInTheDocument();
  });

  test('clicking the button opens the panel, revealing a checkbox per account plus Sum selected', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));

    expect(screen.getByLabelText('GiroA')).toBeInTheDocument();
    expect(screen.getByLabelText('Tages')).toBeInTheDocument();
    expect(screen.getByLabelText('Sum selected')).toBeInTheDocument();
  });

  test('clicking an account checkbox calls onToggleAccount with that account id, not local state', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect();

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    await user.click(screen.getByLabelText('GiroA'));

    expect(props.onToggleAccount).toHaveBeenCalledWith('a1');
    // Controlled component: the checkbox does not flip on its own until the
    // parent feeds the new selectedAccountIds back in.
    expect(screen.getByLabelText('GiroA')).not.toBeChecked();
  });

  test('button label reflects one selected account by name', () => {
    renderSelect({ selectedAccountIds: ['a1'] });

    expect(screen.getByRole('button', { name: 'Accounts: GiroA' })).toBeInTheDocument();
  });

  test('button label collapses two or more selections to a count', () => {
    renderSelect({ selectedAccountIds: ['a1', 'a2'] });

    expect(screen.getByRole('button', { name: 'Accounts: 2 accounts selected' })).toBeInTheDocument();
  });

  test('checkboxes reflect selectedAccountIds when the panel is open', async () => {
    const user = userEvent.setup();
    renderSelect({ selectedAccountIds: ['a2'] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));

    expect(screen.getByLabelText('GiroA')).not.toBeChecked();
    expect(screen.getByLabelText('Tages')).toBeChecked();
  });

  test('Sum selected is disabled with fewer than two selected, enabled with two or more', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderSelect({ selectedAccountIds: ['a1'] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    expect(screen.getByLabelText('Sum selected')).toBeDisabled();

    rerender(<AccountMultiSelect {...props} selectedAccountIds={['a1', 'a2']} />);
    expect(screen.getByLabelText('Sum selected')).not.toBeDisabled();
  });

  test('checking Sum selected calls onSumSelectedChange with true', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedAccountIds: ['a1', 'a2'] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    await user.click(screen.getByLabelText('Sum selected'));

    expect(props.onSumSelectedChange).toHaveBeenCalledWith(true);
  });

  test('clicking outside the component closes the panel without calling either handler', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect();
    render(<button type="button">Outside</button>);

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    expect(screen.getByLabelText('GiroA')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByLabelText('GiroA')).not.toBeInTheDocument();
    expect(props.onToggleAccount).not.toHaveBeenCalled();
    expect(props.onSumSelectedChange).not.toHaveBeenCalled();
  });

  test('pressing Escape while open closes the panel', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    expect(screen.getByLabelText('GiroA')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('GiroA')).not.toBeInTheDocument();
  });

  test('clicking an account checkbox does not close the panel, so several can be checked in one open', async () => {
    const user = userEvent.setup();
    renderSelect();

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    await user.click(screen.getByLabelText('GiroA'));

    expect(screen.getByLabelText('Tages')).toBeInTheDocument();
  });

  test('with nothing selected, the toggle reads "Select all" and selects every account id in one call', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedAccountIds: [] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    await user.click(screen.getByRole('button', { name: 'Select all' }));

    expect(props.onSelectedAccountIdsChange).toHaveBeenCalledWith(['a1', 'a2']);
  });

  test('with every account already selected, the toggle reads "Unselect all" and clears the selection', async () => {
    const user = userEvent.setup();
    const { props } = renderSelect({ selectedAccountIds: ['a1', 'a2'] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));
    expect(screen.getByRole('button', { name: 'Unselect all' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Unselect all' }));

    expect(props.onSelectedAccountIdsChange).toHaveBeenCalledWith([]);
  });

  test('with some but not all accounts selected, the toggle still reads "Select all"', async () => {
    const user = userEvent.setup();
    renderSelect({ selectedAccountIds: ['a1'] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));

    expect(screen.getByRole('button', { name: 'Select all' })).toBeInTheDocument();
  });

  test('with no accounts, the panel still opens showing only the disabled Sum selected row', async () => {
    const user = userEvent.setup();
    renderSelect({ accounts: [] });

    await user.click(screen.getByRole('button', { name: /^Accounts:/ }));

    expect(screen.getByLabelText('Sum selected')).toBeDisabled();
    expect(screen.queryByLabelText('GiroA')).not.toBeInTheDocument();
  });
});
