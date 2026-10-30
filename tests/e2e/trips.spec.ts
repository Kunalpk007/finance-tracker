import { test, expect } from '@playwright/test';
import { loginToWorkspace } from './helpers';

test.describe('trips — a separate mini-ledger for travel spend', () => {
  test('creating a trip, adding people and an expense, and seeing the settle-up balance', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();

    await page.getByTestId('trip-name').fill('Goa 2026');
    await page.getByTestId('trip-start').fill('2026-07-10');
    await page.getByTestId('trip-people').fill('Priya');
    await page.getByTestId('create-trip').click();
    await expect(page.locator('#app')).toContainText('Goa 2026');

    // creator + Priya, shown as a count; the creator is added automatically
    await expect(page.getByTestId('trip-people-count')).toContainText('2 people');
    await page.getByTestId('trip-people-count').click();
    await expect(page.getByTestId('trip-people-list')).toContainText('Priya');
    await page.getByTestId('trip-add-people').click();
    await page.getByTestId('trip-member-name').fill('Rahul, Priya');
    await page.getByTestId('add-trip-member').click(); // Priya is a dupe, only Rahul is added
    await expect(page.getByTestId('trip-people-count')).toContainText('3 people');
    await page.getByTestId('trip-people-count').click();
    await page.getByTestId('trip-people-list').getByText('Rahul').locator('xpath=following::button[1]').click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByTestId('trip-people-count')).toContainText('2 people');

    await page.locator('[data-tripcat="hotel"]').click();
    await page.getByTestId('trip-amount').fill('4000');
    await page.getByTestId('trip-paidby').selectOption({ label: 'Kunal' });
    await page.getByTestId('add-trip-expense').click();

    await expect(page.getByTestId('trip-total')).toContainText('₹4,000');
    await expect(page.locator('#app')).toContainText('gets back ₹2,000'); // Kunal paid all, split in half
    await expect(page.locator('#app')).toContainText('owes ₹2,000'); // Priya owes her half

    // trip spend must not show up in the household reports
    await page.locator('button[data-nav="reports"]').click();
    await expect(page.locator('#app')).not.toContainText('Goa 2026');
  });

  test('switching category on a trip expense keeps the amount and note already typed in', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();
    await page.getByTestId('trip-name').fill('Manali');
    await page.getByTestId('trip-start').fill('2026-07-10');
    await page.getByTestId('create-trip').click();

    await page.locator('[data-tripcat="food"]').click();
    await page.getByTestId('trip-amount').fill('1200');
    await page.getByTestId('trip-note').fill('Dinner');
    await page.locator('[data-tripcat="shopping"]').click();

    await expect(page.getByTestId('trip-amount')).toHaveValue('1200');
    await expect(page.getByTestId('trip-note')).toHaveValue('Dinner');
  });

  test('clicking a logged trip expense opens an edit modal pre-filled with its values, category as a dropdown, and updating it does not duplicate it', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();
    await page.getByTestId('trip-name').fill('Manali');
    await page.getByTestId('trip-start').fill('2026-07-10');
    await page.getByTestId('create-trip').click();

    await page.locator('[data-tripcat="food"]').click();
    await page.getByTestId('trip-amount').fill('1200');
    await page.getByTestId('add-trip-expense').click();
    await expect(page.getByTestId('trip-total')).toContainText('₹1,200');

    await page.locator('[data-edittripexpense]').click();
    const modal = page.locator('#tripExpenseEditModal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('edit-trip-amount')).toHaveValue('1200');
    await expect(page.getByTestId('edit-trip-category')).toHaveValue('food');
    await expect(page.locator('#tripExpenseEditModal [data-testid="trip-category-grid"]')).toHaveCount(0);

    await page.getByTestId('edit-trip-amount').fill('1500');
    await page.getByTestId('edit-trip-category').selectOption('shopping');
    await page.getByTestId('edit-trip-save').click();
    await expect(modal).toBeHidden();

    await expect(page.getByTestId('trip-total')).toContainText('₹1,500');
    await expect(page.locator('[data-edittripexpense]')).toHaveCount(1);
    await expect(page.locator('#app')).toContainText('🛍 Shopping');
  });

  test('cancelling the trip expense edit modal discards changes', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();
    await page.getByTestId('trip-name').fill('Manali');
    await page.getByTestId('trip-start').fill('2026-07-10');
    await page.getByTestId('create-trip').click();

    await page.locator('[data-tripcat="food"]').click();
    await page.getByTestId('trip-amount').fill('1200');
    await page.getByTestId('add-trip-expense').click();

    await page.locator('[data-edittripexpense]').click();
    await page.getByTestId('edit-trip-amount').fill('9999');
    await page.getByTestId('edit-trip-cancel').click();

    await expect(page.locator('#tripExpenseEditModal')).toHaveCount(0);
    await expect(page.getByTestId('trip-total')).toContainText('₹1,200');
  });

  test('closing a trip toggles its status, and it stays visible in the trip list', async ({ page }) => {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();
    await page.getByTestId('trip-name').fill('Weekend Trip');
    await page.getByTestId('trip-start').fill('2026-07-10');
    await page.getByTestId('create-trip').click();

    await page.getByTestId('toggle-trip-status').click();
    await expect(page.locator('#app')).toContainText('closed');
    await page.locator('button[data-goto="trips"]').click();
    await expect(page.locator('#app')).toContainText('Weekend Trip');
  });
});

test('the + button on an event screen focuses that event\'s expense form instead of opening the household form', async ({ page }) => {
  await loginToWorkspace(page, 'kunal@example.com', 'w1');
  await page.locator('button[data-nav="home"]').click();
  await page.getByTestId('goto-trips').click();
  await page.getByTestId('trip-name').fill('Diwali 2026');
  await page.getByTestId('trip-start').fill('2026-11-08');
  await page.getByTestId('create-trip').click();

  await page.locator('#fab').click();
  await expect(page.getByTestId('trip-amount')).toBeFocused();
  await expect(page.getByTestId('tx-amount')).toHaveCount(0);
  await page.getByTestId('trip-amount').fill('500');
  await page.locator('[data-tripcat="food"]').click();
  await page.getByTestId('add-trip-expense').click();
  await expect(page.getByTestId('trip-total')).toContainText('₹500');
});

test.describe('event expenses — custom category, split and multiple payers', () => {
  async function newEvent(page: any, name: string, people = '') {
    await loginToWorkspace(page, 'kunal@example.com', 'w1');
    await page.locator('button[data-nav="home"]').click();
    await page.getByTestId('goto-trips').click();
    await page.getByTestId('trip-name').fill(name);
    await page.getByTestId('trip-start').fill('2026-07-10');
    if (people) await page.getByTestId('trip-people').fill(people);
    await page.getByTestId('create-trip').click();
  }

  test('with nobody else added, "Paid by" lists the user', async ({ page }) => {
    await newEvent(page, 'Solo');
    await expect(page.getByTestId('trip-paidby').locator('option')).toHaveCount(1);
    await expect(page.getByTestId('trip-paidby')).not.toHaveText('');
  });

  test('a custom category can be named and is totalled under its own name', async ({ page }) => {
    await newEvent(page, 'Wedding');
    await page.getByTestId('trip-cat-custom').click();
    await page.getByTestId('trip-amount').fill('700');
    await page.getByTestId('add-trip-expense').click(); // no name yet
    await expect(page.getByTestId('trip-total')).toContainText('₹0');
    await page.getByTestId('trip-custom-cat').fill('Gifts');
    await page.getByTestId('add-trip-expense').click();
    await expect(page.getByTestId('trip-total')).toContainText('₹700');
    await expect(page.locator('#app')).toContainText('Gifts');
  });

  test('a bill can be split between only the chosen people', async ({ page }) => {
    await newEvent(page, 'Dinner out', 'Priya, Rahul, Asha');
    await page.locator('[data-tripcat="food"]').click();
    await page.getByTestId('trip-amount').fill('1000');
    await page.locator('[data-tripsplit]', { hasText: 'Rahul' }).click();
    await page.locator('[data-tripsplit]', { hasText: 'Asha' }).click();
    await page.getByTestId('add-trip-expense').click();
    await expect(page.locator('#app')).toContainText('split 2 ways');
    await expect(page.locator('#app')).toContainText('gets back ₹500'); // payer, owed the other half
    await expect(page.locator('#app')).toContainText('owes ₹500'); // the one who shared the dinner
  });

  test('several people can pay one bill, and the amounts must add up to it', async ({ page }) => {
    await newEvent(page, 'Hotel stay', 'Priya');
    await page.locator('[data-tripcat="hotel"]').click();
    await page.getByTestId('trip-amount').fill('1000');
    await page.getByTestId('trip-multi-pay').click();
    await page.locator('[id^="tripPay-"]').nth(0).fill('600');
    await page.locator('[id^="tripPay-"]').nth(1).fill('300');
    await expect(page.getByTestId('trip-pay-left')).toContainText('₹100 still to assign');
    await page.getByTestId('add-trip-expense').click();
    await expect(page.getByTestId('trip-total')).toContainText('₹0'); // rejected, not saved

    await page.locator('[id^="tripPay-"]').nth(1).fill('400');
    await page.getByTestId('add-trip-expense').click();
    await expect(page.getByTestId('trip-total')).toContainText('₹1,000');
    await expect(page.locator('#app')).toContainText('gets back ₹100'); // paid 600, share 500
    await expect(page.locator('#app')).toContainText('owes ₹100'); // paid 400, share 500
  });
});
