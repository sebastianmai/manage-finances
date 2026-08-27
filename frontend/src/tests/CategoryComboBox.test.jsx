import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryComboBox from '../components/CategoryComboBox';

const CATEGORIES = ['Groceries', 'Housing', 'Transportation'];

function Harness({ categories = CATEGORIES, initialValue = '', onChangeSpy }) {
  const [value, setValue] = useState(initialValue);

  const handleChange = (nextValue) => {
    onChangeSpy(nextValue);
    setValue(nextValue);
  };

  return (
    <div>
      <label htmlFor="category">Category:</label>
      <CategoryComboBox
        id="category"
        value={value}
        categories={categories}
        onChange={handleChange}
      />
      <button type="button">Outside</button>
    </div>
  );
}

function setup({ categories, initialValue } = {}) {
  const onChangeSpy = jest.fn();
  render(
    <Harness categories={categories} initialValue={initialValue} onChangeSpy={onChangeSpy} />
  );
  return { onChangeSpy };
}

describe('CategoryComboBox', () => {
  test('closed by default: no listbox in the DOM, aria-expanded is false', () => {
    setup();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Category:')).toHaveAttribute('aria-expanded', 'false');
  });

  test('open on focus (D-02): clicking an empty input renders one option per category, in order', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByLabelText('Category:'));

    const listbox = screen.getByRole('listbox');
    const optionTexts = within(listbox).getAllByRole('option').map((o) => o.textContent);
    expect(optionTexts).toEqual(CATEGORIES);
    expect(screen.getByLabelText('Category:')).toHaveAttribute('aria-expanded', 'true');
  });

  test('substring filtering (D-01): "roc" narrows to Groceries only, case-insensitively', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('Category:'), 'roc');

    let listbox = screen.getByRole('listbox');
    let optionTexts = within(listbox).getAllByRole('option').map((o) => o.textContent);
    expect(optionTexts).toEqual(['Groceries']);

    await user.clear(screen.getByLabelText('Category:'));
    await user.type(screen.getByLabelText('Category:'), 'GROC');

    listbox = screen.getByRole('listbox');
    optionTexts = within(listbox).getAllByRole('option').map((o) => o.textContent);
    expect(optionTexts).toEqual(['Groceries']);
  });

  test('click to select: clicking an option calls onChange with that exact string and closes the panel', async () => {
    const user = userEvent.setup();
    const { onChangeSpy } = setup();

    await user.click(screen.getByLabelText('Category:'));
    await user.click(screen.getByRole('option', { name: 'Housing' }));

    expect(onChangeSpy).toHaveBeenCalledWith('Housing');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('arrow keys plus Enter: ArrowDown highlights the first option, Enter selects it', async () => {
    const user = userEvent.setup();
    const { onChangeSpy } = setup();

    const input = screen.getByLabelText('Category:');
    await user.click(input);
    await user.keyboard('{ArrowDown}');

    const firstOption = screen.getByRole('option', { name: 'Groceries' });
    expect(input).toHaveAttribute('aria-activedescendant', firstOption.id);
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Enter}');

    expect(onChangeSpy).toHaveBeenCalledWith('Groceries');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('wraparound both ways (D-05): Down off the last option returns to the first; Up off the first goes to the last', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByLabelText('Category:');
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');

    const lastOption = screen.getByRole('option', { name: 'Transportation' });
    expect(input).toHaveAttribute('aria-activedescendant', lastOption.id);

    await user.keyboard('{ArrowDown}');
    const firstOption = screen.getByRole('option', { name: 'Groceries' });
    expect(input).toHaveAttribute('aria-activedescendant', firstOption.id);

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveAttribute('aria-activedescendant', lastOption.id);
  });

  test('nothing pre-highlighted (D-06): opening the panel highlights no row', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByLabelText('Category:');
    await user.click(input);

    expect(input).not.toHaveAttribute('aria-activedescendant');
    const listbox = screen.getByRole('listbox');
    within(listbox).getAllByRole('option').forEach((option) => {
      expect(option).toHaveAttribute('aria-selected', 'false');
    });
  });

  test('Enter with nothing highlighted keeps the typed text (D-06)', async () => {
    const user = userEvent.setup();
    const { onChangeSpy } = setup();

    const input = screen.getByLabelText('Category:');
    await user.type(input, 'Groceries');
    onChangeSpy.mockClear();
    await user.keyboard('{Enter}');

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(input).toHaveValue('Groceries');
  });

  test('Escape (D-07): closes the panel and leaves the typed text untouched', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByLabelText('Category:');
    await user.type(input, 'roc');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('roc');
  });

  test('reopen after Escape: clicking the input again brings the listbox back', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByLabelText('Category:');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  test('outside click (D-08): closes the panel and leaves the typed text untouched', async () => {
    const user = userEvent.setup();
    setup();

    const input = screen.getByLabelText('Category:');
    await user.type(input, 'roc');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('roc');
  });

  test('no-match hint row (D-03): typing an unmatched string renders exactly one create-hint option', async () => {
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText('Category:'), 'Kinderbetreuung');

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('Create "Kinderbetreuung"');
  });

  test('hint row is selectable (D-04): click leaves the typed text as the value, and it is also arrow-key reachable', async () => {
    const user = userEvent.setup();
    const { onChangeSpy } = setup();

    const input = screen.getByLabelText('Category:');
    await user.type(input, 'Kinderbetreuung');
    await user.click(screen.getByRole('option', { name: 'Create "Kinderbetreuung"' }));

    expect(input).toHaveValue('Kinderbetreuung');
    expect(onChangeSpy).toHaveBeenLastCalledWith('Kinderbetreuung');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    onChangeSpy.mockClear();
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChangeSpy).toHaveBeenCalledWith('Kinderbetreuung');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  test('empty categories list edge case: focusing renders nothing until text narrows to the create-hint row', async () => {
    const user = userEvent.setup();
    setup({ categories: [] });

    const input = screen.getByLabelText('Category:');
    await user.click(input);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.type(input, 'Freelance');

    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toBe('Create "Freelance"');
  });

  test('maxLength: the input carries a default maxLength of 50', () => {
    setup();

    expect(screen.getByLabelText('Category:')).toHaveAttribute('maxLength', '50');
  });
});
