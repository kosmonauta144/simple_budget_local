const currency = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const form = document.querySelector('#expense-form');
const formMessage = document.querySelector('#form-message');
const totalAmount = document.querySelector('#total-amount');
const categoryList = document.querySelector('#category-list');
const expenseList = document.querySelector('#expense-list');
const expenseCount = document.querySelector('#expense-count');
const dateInput = form.querySelector('input[name="date"]');
const incomeForm = document.querySelector('#income-form');
const incomeAmount = document.querySelector('#income-amount');
const incomeInput = document.querySelector('#income-input');
const incomeName = document.querySelector('#income-name');
const incomeList = document.querySelector('#income-list');
const incomeSubmit = document.querySelector('#income-submit');
const cancelIncome = document.querySelector('#cancel-income');
const incomeMessage = document.querySelector('#income-message');
let editingIncomeId = null;
const recurringForm = document.querySelector('#recurring-form');
const recurringName = document.querySelector('#recurring-name');
const recurringCategory = document.querySelector('#recurring-category');
const recurringDeadline = document.querySelector('#recurring-deadline');
const recurringInput = document.querySelector('#recurring-input');
const recurringList = document.querySelector('#recurring-list');
const recurringTotal = document.querySelector('#recurring-total');
const recurringSubmit = document.querySelector('#recurring-submit');
const cancelRecurring = document.querySelector('#cancel-recurring');
const recurringMessage = document.querySelector('#recurring-message');
let editingRecurringId = null;
const temporaryIncomeForm = document.querySelector('#temporary-income-form');
const temporaryIncomeName = document.querySelector('#temporary-income-name');
const temporaryIncomeInput = document.querySelector('#temporary-income-input');
const temporaryIncomeList = document.querySelector('#temporary-income-list');
const temporaryIncomeTotal = document.querySelector('#temporary-income-total');
const temporaryIncomeSubmit = document.querySelector('#temporary-income-submit');
const cancelTemporaryIncome = document.querySelector('#cancel-temporary-income');
const temporaryIncomeMessage = document.querySelector('#temporary-income-message');
let editingTemporaryIncomeId = null;
const pieChart = document.querySelector('#pie-chart');
const chartLegend = document.querySelector('#chart-legend');
const projectedSavings = document.querySelector('#projected-savings');
const chartCenter = document.querySelector('#chart-center');
const chartColors = ['#e7765d', '#1f6b4d', '#d2ad5d', '#6d8990', '#b36b85', '#7c8b52', '#c48a57', '#3f6f72'];
const categoryOptions = [
  'Dom',
  'Jedzenie',
  'Transport',
  'Zdrowie',
  'Rozrywka',
  'Słodycze',
  'Słone przekąski',
  'Ubrania',
  'Prezenty',
  'Media',
  'Podróże',
  'Kosmetyki domowe',
  'Dziesięcina',
  'Elektronika domowa',
  'Oszczędności',
  'Inne',
];
const expenseCategory = document.querySelector('#expense-category');
const receiptImageInput = document.querySelector('#receipt-image');
const receiptPreviewWrap = document.querySelector('#receipt-preview-wrap');
const receiptPreview = document.querySelector('#receipt-preview');
const receiptRemoveImage = document.querySelector('#receipt-remove-image');
const receiptAnalyzeButton = document.querySelector('#receipt-analyze');
const receiptMessage = document.querySelector('#receipt-message');
const receiptReview = document.querySelector('#receipt-review');
const receiptDateInput = document.querySelector('#receipt-date');
const receiptItems = document.querySelector('#receipt-items');
const receiptTotalDisplay = document.querySelector('#receipt-total');
const receiptAllocationDisplay = document.querySelector('#receipt-allocation-total');
const receiptAllocationStatus = document.querySelector('#receipt-allocation-status');
const receiptConfirmButton = document.querySelector('#receipt-confirm');
let receiptImageBase64 = '';
let receiptMimeType = '';
let receiptTotalCents = 0;
let receiptRequestToken = 0;

function populateCategorySelect(selectElement, selectedValue = '') {
  if (!selectElement) return;

  selectElement.innerHTML = `
    <option value="" disabled ${selectedValue ? '' : 'selected'}>Wybierz kategorię</option>
    ${categoryOptions.map((category) => `
      <option value="${category}" ${selectedValue === category ? 'selected' : ''}>${category}</option>
    `).join('')}
  `;
}

// Month selection state
let selectedMonth = new Date();

const prevMonthButton = document.querySelector('#prev-month');
const nextMonthButton = document.querySelector('#next-month');
const selectedMonthDisplay = document.querySelector('#selected-month');

document.querySelector('#current-month').textContent = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date());
dateInput.value = new Date().toISOString().slice(0, 10);
populateCategorySelect(expenseCategory);
populateCategorySelect(recurringCategory);

function updateMonthDisplay() {
  selectedMonthDisplay.textContent = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(selectedMonth);
}

function getMonthString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

prevMonthButton.addEventListener('click', () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1, 1);
  updateMonthDisplay();
  loadDashboard(selectedMonth);
});

nextMonthButton.addEventListener('click', () => {
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 1);
  updateMonthDisplay();
  loadDashboard(selectedMonth);
});

function formatAmount(cents) {
  return currency.format(cents / 100);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('pl-PL').format(new Date(`${value}T00:00:00`));
}

function renderDashboard(data) {
  totalAmount.textContent = formatAmount(data.total);
  incomeAmount.textContent = formatAmount(data.income);
  temporaryIncomeTotal.textContent = formatAmount(data.temporary_income_total || 0);
  recurringTotal.textContent = formatAmount(data.recurring_total);
  projectedSavings.textContent = `${formatAmount(data.projected_savings)} zł`;
  projectedSavings.classList.toggle('negative', data.projected_savings < 0);
  const savingsPercent = data.income > 0 ? data.projected_savings / data.income * 100 : 0;
  chartCenter.textContent = `${Math.round(savingsPercent)}%`;
  const chartExpenses = [
    ...data.categories.map((category) => ({ name: category.category, amount: category.total })),
    ...(data.recurring_categories || []).map((category) => ({ name: category.category, amount: category.total })),
  ];
  if (!chartExpenses.length && data.recurring_total > 0) {
    chartExpenses.push({ name: 'Stałe wydatki', amount: data.recurring_total });
  }
  const chartExpenseTotal = chartExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const chartSavings = Math.max(0, data.projected_savings);
  const chartTotal = chartExpenseTotal + chartSavings;
  if (!chartTotal) {
    pieChart.style.background = 'var(--line)';
    chartLegend.innerHTML = '<p class="empty-state">Dodaj wydatki, aby zobaczyć strukturę.</p>';
  } else {
    let currentPercent = 0;
    const slices = chartExpenses.map((expense, index) => {
      const percent = expense.amount / chartTotal * 100;
      const slice = `${chartColors[index % chartColors.length]} ${currentPercent}% ${currentPercent + percent}%`;
      currentPercent += percent;
      return { expense, percent, color: chartColors[index % chartColors.length], slice };
    });
    if (chartSavings > 0) {
      slices.push({ expense: { name: 'Oszczędności', amount: chartSavings }, percent: chartSavings / chartTotal * 100, color: 'var(--violet)', slice: `var(--violet) ${currentPercent}% 100%` });
    }
    pieChart.style.background = `conic-gradient(${slices.map((item) => item.slice).join(', ')})`;
    chartLegend.innerHTML = slices.map((item) => `
      <div class="legend-row"><span class="legend-swatch" style="background:${item.color}"></span><span>${escapeHtml(item.expense.name)}</span><strong>${item.expense.name === 'Oszczędności' ? Math.round(savingsPercent) : Math.round(item.percent)}%</strong></div>`).join('');
  }
  recurringList.innerHTML = data.recurring_expenses.length ? data.recurring_expenses.map((expense) => `
    <div class="income-row">
      <label class="paid-toggle">
        <input type="checkbox" data-recurring-paid="${expense.id}" ${expense.is_paid ? 'checked' : ''}>
        <span>${expense.is_paid ? 'Zapłacone' : 'Do zapłaty'}</span>
      </label>
      <span>${escapeHtml(expense.name)} <small>(${escapeHtml(expense.category || 'Inne')}${expense.payment_deadline ? ` • termin ${expense.payment_deadline}` : ''})</small></span>
      <strong>${formatAmount(expense.amount)} zł</strong>
      <button class="edit-button" type="button" data-recurring-id="${expense.id}">Edytuj</button>
      <button class="delete-button" type="button" data-recurring-delete="${expense.id}" aria-label="Usuń stały wydatek">×</button>
    </div>`).join('') : '<p class="empty-state">Dodaj pierwszy stały wydatek poniżej.</p>';
  incomeList.innerHTML = data.incomes.length ? data.incomes.map((income) => `
    <div class="income-row">
      <span>${escapeHtml(income.name)}</span>
      <strong>${formatAmount(income.amount)} zł</strong>
      <button class="edit-button" type="button" data-income-id="${income.id}">Edytuj</button>
      <button class="delete-button" type="button" data-income-delete="${income.id}" aria-label="Usuń przychód">×</button>
    </div>`).join('') : '<p class="empty-state">Dodaj pierwszy przychód poniżej.</p>';
  temporaryIncomeList.innerHTML = data.temporary_incomes.length ? data.temporary_incomes.map((income) => `
    <div class="income-row">
      <span>${escapeHtml(income.name)}</span>
      <strong>${formatAmount(income.amount)} zł</strong>
      <button class="edit-button" type="button" data-temporary-income-id="${income.id}">Edytuj</button>
      <button class="delete-button" type="button" data-temporary-income-delete="${income.id}" aria-label="Usuń jednorazowy przychód">×</button>
    </div>`).join('') : '<p class="empty-state">Dodaj pierwszy jednorazowy przychód poniżej.</p>';
  expenseCount.textContent = data.expenses.length;

  if (!data.categories.length) {
    categoryList.innerHTML = '<p class="empty-state">Brak wydatków. Dodaj pierwszy powyżej.</p>';
  } else {
    const max = data.categories[0].total;
    categoryList.innerHTML = data.categories.map((category) => `
      <div class="category-row">
        <span class="category-label">${escapeHtml(category.category)}</span>
        <div class="bar"><span style="width: ${Math.max(4, category.total / max * 100)}%"></span></div>
        <span class="category-amount">${formatAmount(category.total)} zł</span>
      </div>`).join('');
  }

  if (!data.expenses.length) {
    expenseList.innerHTML = '<tr><td colspan="5" class="empty-state">Twoja historia jest pusta.</td></tr>';
  } else {
    const sortedExpenses = [...data.expenses].sort((first, second) => {
      const dateOrder = String(second.expense_date).localeCompare(String(first.expense_date));
      if (dateOrder) return dateOrder;
      const firstId = Number(first.id);
      const secondId = Number(second.id);
      return Number.isFinite(firstId) && Number.isFinite(secondId)
        ? secondId - firstId
        : String(second.id).localeCompare(String(first.id), 'pl', { numeric: true });
    });
    const expenseRows = [];
    const receipts = new Map();
    sortedExpenses.forEach((expense) => {
      if (expense.receipt_id == null) {
        expenseRows.push({ type: 'expense', expense });
        return;
      }
      let receipt = receipts.get(expense.receipt_id);
      if (!receipt) {
        receipt = { type: 'receipt', expenses: [], groupId: receipts.size };
        receipts.set(expense.receipt_id, receipt);
        expenseRows.push(receipt);
      }
      receipt.expenses.push(expense);
    });

    expenseList.innerHTML = expenseRows.map((row) => {
      if (row.type === 'expense') {
        const expense = row.expense;
        return `
          <tr>
            <td>${escapeHtml(expense.name)}</td>
            <td>${escapeHtml(expense.category)}</td>
            <td>${formatDate(expense.expense_date)}</td>
            <td>${formatAmount(expense.amount)} zł</td>
            <td><button class="delete-button" data-id="${escapeHtml(expense.id)}" aria-label="Usuń wydatek" title="Usuń wydatek">×</button></td>
          </tr>`;
      }

      const receiptId = `receipt-items-${row.groupId}`;
      const receiptCategories = new Set(row.expenses.map((expense) => String(expense.category ?? '')));
      const category = receiptCategories.size === 1 ? row.expenses[0].category : 'Różne kategorie';
      const itemCount = row.expenses.length;
      const lastTwoDigits = itemCount % 100;
      const itemLabel = itemCount % 10 === 1 && lastTwoDigits !== 11
        ? 'pozycja'
        : itemCount % 10 >= 2 && itemCount % 10 <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)
          ? 'pozycje'
          : 'pozycji';
      const receiptTotal = row.expenses.reduce((sum, expense) => sum + expense.amount, 0);
      const summary = `Paragon · ${itemCount} ${itemLabel}`;
      const controlledRows = row.expenses.map((_, index) => `${receiptId}-${index}`).join(' ');
      return `
        <tr class="receipt-summary-row">
          <td><button class="receipt-summary-toggle" type="button" data-receipt-group="${receiptId}" aria-expanded="false" aria-controls="${controlledRows}">${escapeHtml(summary)}</button></td>
          <td>${escapeHtml(category)}</td>
          <td>${formatDate(row.expenses[0].expense_date)}</td>
          <td>${formatAmount(receiptTotal)} zł</td>
          <td></td>
        </tr>
        ${row.expenses.map((expense, index) => `
          <tr id="${receiptId}-${index}" class="receipt-child-row" data-receipt-group="${receiptId}" hidden>
            <td>${escapeHtml(expense.name)}</td>
            <td>${escapeHtml(expense.category)}</td>
            <td>${formatDate(expense.expense_date)}</td>
            <td>${formatAmount(expense.amount)} zł</td>
            <td><button class="delete-button" data-id="${escapeHtml(expense.id)}" aria-label="Usuń wydatek" title="Usuń wydatek">×</button></td>
          </tr>`).join('')}`;
    }).join('');
  }
}

function resetIncomeForm() {
  editingIncomeId = null;
  incomeForm.reset();
  incomeSubmit.innerHTML = 'Dodaj przychód <span>↗</span>';
  cancelIncome.hidden = true;
}

function resetExpenseForm() {
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  populateCategorySelect(expenseCategory);
}

function amountToCents(value) {
  const amount = Number(String(value).replace(',', '.'));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centsToDecimal(cents) {
  return (cents / 100).toFixed(2);
}

function updateReceiptTotals() {
  const rows = [...receiptItems.querySelectorAll('.receipt-item')];
  const allocations = rows.map((row) => ({
    name: row.querySelector('[data-receipt-name]').value.trim(),
    amount: row.querySelector('[data-receipt-amount]').value,
    category: row.querySelector('[data-receipt-category]').value,
  }));
  const allocationCents = allocations.reduce((sum, item) => sum + amountToCents(item.amount), 0);
  const difference = Math.abs(receiptTotalCents - allocationCents);
  const rowsAreValid = allocations.length > 0 && allocations.every((item) => item.name && item.category && amountToCents(item.amount) > 0);
  const dateIsValid = /^\d{4}-\d{2}-\d{2}$/.test(receiptDateInput.value);
  const matches = difference === 0;
  const withinTolerance = difference <= 1;

  receiptTotalDisplay.textContent = `${formatAmount(receiptTotalCents)} zł`;
  receiptAllocationDisplay.textContent = `${formatAmount(allocationCents)} zł`;
  receiptAllocationStatus.textContent = matches
    ? 'Podział zgadza się z kwotą paragonu.'
    : withinTolerance
      ? `Różnica: ${formatAmount(difference)} zł. Zapis jest dozwolony w ramach tolerancji.`
      : `Różnica: ${formatAmount(difference)} zł. Dostosuj pozycje przed zapisem.`;
  receiptAllocationStatus.classList.toggle('is-matched', matches);
  receiptConfirmButton.disabled = !rowsAreValid || !dateIsValid || !withinTolerance;
}

function addReceiptItem(item = {}) {
  const row = document.createElement('div');
  row.className = 'receipt-item';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Nazwa';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 80;
  nameInput.required = true;
  nameInput.value = String(item.name || '');
  nameInput.dataset.receiptName = '';
  nameInput.setAttribute('aria-label', 'Nazwa pozycji paragonu');
  nameLabel.append(nameInput);

  const amountLabel = document.createElement('label');
  amountLabel.textContent = 'Kwota';
  const amountInput = document.createElement('input');
  amountInput.type = 'number';
  amountInput.min = '0.01';
  amountInput.step = '0.01';
  amountInput.required = true;
  amountInput.value = centsToDecimal(amountToCents(item.amount || 0));
  amountInput.dataset.receiptAmount = '';
  amountInput.setAttribute('aria-label', 'Kwota pozycji paragonu w złotych');
  amountLabel.append(amountInput);

  const categoryLabel = document.createElement('label');
  categoryLabel.textContent = 'Kategoria';
  const categorySelect = document.createElement('select');
  categorySelect.required = true;
  categorySelect.dataset.receiptCategory = '';
  categorySelect.setAttribute('aria-label', 'Kategoria pozycji paragonu');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Wybierz kategorię';
  placeholder.disabled = true;
  categorySelect.append(placeholder);
  categoryOptions.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    categorySelect.append(option);
  });
  categorySelect.value = categoryOptions.includes(item.category) ? item.category : 'Inne';
  categoryLabel.append(categorySelect);

  const actions = document.createElement('div');
  actions.className = 'receipt-item-actions';
  const splitButton = document.createElement('button');
  splitButton.type = 'button';
  splitButton.className = 'text-button';
  splitButton.textContent = 'Podziel';
  splitButton.setAttribute('aria-label', `Podziel pozycję ${item.name || ''}`.trim());
  splitButton.addEventListener('click', () => {
    const cents = amountToCents(amountInput.value);
    if (cents < 2) {
      receiptMessage.textContent = 'Kwota musi wynosić co najmniej 0,02 zł, aby ją podzielić.';
      return;
    }
    const firstShare = Math.floor(cents / 2);
    amountInput.value = centsToDecimal(firstShare);
    addReceiptItem({ name: nameInput.value, category: categorySelect.value, amount: centsToDecimal(cents - firstShare) });
    receiptMessage.textContent = '';
    updateReceiptTotals();
  });
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'delete-button';
  removeButton.textContent = 'Usuń';
  removeButton.setAttribute('aria-label', `Usuń pozycję ${item.name || ''}`.trim());
  removeButton.addEventListener('click', () => {
    row.remove();
    updateReceiptTotals();
  });
  actions.append(splitButton, removeButton);
  row.append(nameLabel, amountLabel, categoryLabel, actions);
  receiptItems.append(row);
  row.addEventListener('input', updateReceiptTotals);
  row.addEventListener('change', updateReceiptTotals);
  updateReceiptTotals();
}

function clearReceiptImage() {
  receiptRequestToken += 1;
  receiptImageInput.value = '';
  receiptImageBase64 = '';
  receiptMimeType = '';
  receiptPreview.removeAttribute('src');
  receiptPreviewWrap.hidden = true;
  receiptAnalyzeButton.disabled = true;
  receiptReview.hidden = true;
  receiptItems.replaceChildren();
  receiptTotalCents = 0;
  receiptMessage.textContent = '';
}

receiptImageInput.addEventListener('change', () => {
  const requestToken = ++receiptRequestToken;
  const file = receiptImageInput.files[0];
  receiptImageBase64 = '';
  receiptMimeType = '';
  receiptPreview.removeAttribute('src');
  receiptPreviewWrap.hidden = true;
  receiptReview.hidden = true;
  receiptItems.replaceChildren();
  receiptTotalCents = 0;
  receiptAnalyzeButton.disabled = true;
  receiptMessage.textContent = '';
  if (!file) return;
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!supportedTypes.includes(file.type)) {
    receiptImageInput.value = '';
    receiptMessage.textContent = 'Wybierz plik JPG, PNG lub WebP.';
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    receiptImageInput.value = '';
    receiptMessage.textContent = 'Zdjęcie może mieć maksymalnie 8 MB.';
    return;
  }

  receiptMimeType = file.type;
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (requestToken !== receiptRequestToken) return;
    const result = String(reader.result || '');
    const separator = result.indexOf(',');
    if (separator < 0) {
      receiptMessage.textContent = 'Nie udało się odczytać zdjęcia.';
      return;
    }
    receiptImageBase64 = result.slice(separator + 1);
    receiptPreview.src = result;
    receiptPreviewWrap.hidden = false;
    receiptAnalyzeButton.disabled = false;
  });
  reader.addEventListener('error', () => {
    if (requestToken !== receiptRequestToken) return;
    receiptMessage.textContent = 'Nie udało się odczytać zdjęcia.';
  });
  reader.readAsDataURL(file);
});

receiptRemoveImage.addEventListener('click', clearReceiptImage);

receiptAnalyzeButton.addEventListener('click', async () => {
  if (!receiptImageBase64) return;
  const requestToken = ++receiptRequestToken;
  const image = receiptImageBase64;
  const mimeType = receiptMimeType;
  receiptAnalyzeButton.disabled = true;
  receiptMessage.textContent = 'Odczytywanie paragonu…';
  try {
    const response = await fetch('/api/receipts/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, mime_type: mimeType, categories: categoryOptions }),
    });
    const data = await response.json();
    if (requestToken !== receiptRequestToken) return;
    if (!response.ok) throw new Error(data.error || 'Nie udało się odczytać paragonu.');
    const totalCents = amountToCents(data.total);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || totalCents <= 0 || !Array.isArray(data.items)) {
      throw new Error('Otrzymane dane paragonu są niekompletne.');
    }
    receiptTotalCents = totalCents;
    receiptDateInput.value = data.date;
    receiptItems.replaceChildren();
    data.items.forEach((item) => addReceiptItem({
      name: item.name,
      amount: item.amount,
      category: categoryOptions.includes(item.category) ? item.category : 'Inne',
    }));
    if (!data.items.length) addReceiptItem();
    receiptReview.hidden = false;
    receiptMessage.textContent = Array.isArray(data.warnings) && data.warnings.length
      ? `Odczytano paragon. ${data.warnings.map(String).join(' ')}`
      : 'Sprawdź dane i podział przed zapisem.';
    updateReceiptTotals();
  } catch (error) {
    if (requestToken === receiptRequestToken) {
      receiptMessage.textContent = error.message || 'Nie udało się odczytać paragonu.';
    }
  } finally {
    if (requestToken === receiptRequestToken) {
      receiptAnalyzeButton.disabled = !receiptImageBase64;
    }
  }
});

document.querySelector('#receipt-add-item').addEventListener('click', () => addReceiptItem());
receiptDateInput.addEventListener('input', updateReceiptTotals);

receiptConfirmButton.addEventListener('click', async () => {
  updateReceiptTotals();
  if (receiptConfirmButton.disabled) return;
  const expenses = [...receiptItems.querySelectorAll('.receipt-item')].map((row) => ({
    name: row.querySelector('[data-receipt-name]').value.trim(),
    category: row.querySelector('[data-receipt-category]').value,
    amount: centsToDecimal(amountToCents(row.querySelector('[data-receipt-amount]').value)),
    date: receiptDateInput.value,
  }));
  receiptConfirmButton.disabled = true;
  receiptMessage.textContent = 'Zapisywanie wydatków…';
  try {
    const response = await fetch('/api/expenses/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Nie udało się zapisać wydatków.');
    if (data.dashboard) {
      window.dashboardData = data.dashboard;
      renderDashboard(data.dashboard);
    }
    receiptReview.hidden = true;
    receiptItems.replaceChildren();
    receiptTotalCents = 0;
    clearReceiptImage();
    receiptMessage.textContent = 'Zapisano wydatki z paragonu.';
    try {
      await loadDashboard(selectedMonth);
    } catch {}
  } catch (error) {
    receiptMessage.textContent = error.message || 'Nie udało się zapisać wydatków.';
    updateReceiptTotals();
  }
});

incomeList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-income-id]');
  const deleteButton = event.target.closest('[data-income-delete]');
  if (editButton) {
    const income = window.dashboardData.incomes.find((item) => String(item.id) === editButton.dataset.incomeId);
    editingIncomeId = income.id;
    incomeName.value = income.name;
    incomeInput.value = (income.amount / 100).toFixed(2);
    incomeSubmit.innerHTML = 'Zapisz zmiany <span>↗</span>';
    cancelIncome.hidden = false;
    incomeName.focus();
  }
  if (deleteButton) {
    fetch(`/api/incomes/${deleteButton.dataset.incomeDelete}`, { method: 'DELETE' }).then((response) => response.json()).then((data) => { window.dashboardData = data; resetIncomeForm(); renderDashboard(data); });
  }
});

cancelIncome.addEventListener('click', resetIncomeForm);

function resetTemporaryIncomeForm() {
  editingTemporaryIncomeId = null;
  temporaryIncomeForm.reset();
  temporaryIncomeSubmit.innerHTML = 'Dodaj przychód <span>↗</span>';
  cancelTemporaryIncome.hidden = true;
  temporaryIncomeMessage.textContent = '';
}

function resetRecurringForm() {
  editingRecurringId = null;
  recurringForm.reset();
  populateCategorySelect(recurringCategory);
  recurringDeadline.value = '';
  recurringSubmit.innerHTML = 'Dodaj wydatek <span>↗</span>';
  cancelRecurring.hidden = true;
  recurringMessage.textContent = '';
}

temporaryIncomeList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-temporary-income-id]');
  const deleteButton = event.target.closest('[data-temporary-income-delete]');
  if (editButton) {
    const income = window.dashboardData.temporary_incomes.find((item) => String(item.id) === editButton.dataset.temporaryIncomeId);
    editingTemporaryIncomeId = income.id;
    temporaryIncomeName.value = income.name;
    temporaryIncomeInput.value = (income.amount / 100).toFixed(2);
    temporaryIncomeSubmit.innerHTML = 'Zapisz zmiany <span>↗</span>';
    cancelTemporaryIncome.hidden = false;
    temporaryIncomeName.focus();
  }
  if (deleteButton) {
    fetch(`/api/temporary-incomes/${deleteButton.dataset.temporaryIncomeDelete}`, { method: 'DELETE' }).then((response) => response.json()).then((data) => { window.dashboardData = data; resetTemporaryIncomeForm(); renderDashboard(data); });
  }
});

cancelTemporaryIncome.addEventListener('click', resetTemporaryIncomeForm);

recurringList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-recurring-id]');
  const deleteButton = event.target.closest('[data-recurring-delete]');
  if (editButton) {
    const expense = window.dashboardData.recurring_expenses.find((item) => String(item.id) === editButton.dataset.recurringId);
    editingRecurringId = expense.id;
    recurringName.value = expense.name;
    recurringCategory.value = expense.category || 'Inne';
    recurringDeadline.value = expense.payment_deadline ?? '';
    recurringInput.value = (expense.amount / 100).toFixed(2);
    recurringSubmit.innerHTML = 'Zapisz zmiany <span>↗</span>';
    cancelRecurring.hidden = false;
    recurringName.focus();
  }
  if (deleteButton) {
    fetch(`/api/recurring-expenses/${deleteButton.dataset.recurringDelete}`, { method: 'DELETE' }).then((response) => response.json()).then((data) => { window.dashboardData = data; resetRecurringForm(); renderDashboard(data); });
  }
});

cancelRecurring.addEventListener('click', resetRecurringForm);

recurringList.addEventListener('change', async (event) => {
  const paidToggle = event.target.closest('[data-recurring-paid]');
  if (!paidToggle) {
    return;
  }
  const response = await fetch(`/api/recurring-expenses/${paidToggle.dataset.recurringPaid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_paid: paidToggle.checked }),
  });
  const data = await response.json();
  if (!response.ok) {
    recurringMessage.textContent = data.error;
    return;
  }
  window.dashboardData = data;
  renderDashboard(data);
});

recurringForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch(editingRecurringId ? `/api/recurring-expenses/${editingRecurringId}` : '/api/recurring-expenses', {
    method: editingRecurringId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: recurringName.value, category: recurringCategory.value, payment_deadline: recurringDeadline.value, month: getMonthString(selectedMonth), amount: recurringInput.value }),
  });
  const data = await response.json();
  if (!response.ok) {
    recurringMessage.textContent = data.error;
    return;
  }
  window.dashboardData = data;
  renderDashboard(data);
  resetRecurringForm();
});

incomeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch(editingIncomeId ? `/api/incomes/${editingIncomeId}` : '/api/incomes', {
    method: editingIncomeId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: incomeName.value, amount: incomeInput.value, month: getMonthString(selectedMonth) }),
  });
  const data = await response.json();
  if (!response.ok) {
    incomeMessage.textContent = data.error;
    return;
  }
  window.dashboardData = data;
  renderDashboard(data);
  resetIncomeForm();
});

temporaryIncomeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch(editingTemporaryIncomeId ? `/api/temporary-incomes/${editingTemporaryIncomeId}` : '/api/temporary-incomes', {
    method: editingTemporaryIncomeId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: temporaryIncomeName.value, amount: temporaryIncomeInput.value, month: getMonthString(selectedMonth) }),
  });
  const data = await response.json();
  if (!response.ok) {
    temporaryIncomeMessage.textContent = data.error;
    return;
  }
  window.dashboardData = data;
  renderDashboard(data);
  resetTemporaryIncomeForm();
});

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
}

async function loadDashboard(monthDate = new Date()) {
  const monthString = getMonthString(monthDate);
  const response = await fetch(`/api/dashboard?month=${monthString}`);
  window.dashboardData = await response.json();
  renderDashboard(window.dashboardData);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.textContent = '';
  const values = Object.fromEntries(new FormData(form));
  const response = await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const data = await response.json();
  if (!response.ok) {
    formMessage.textContent = data.error;
    return;
  }
  resetExpenseForm();
  formMessage.textContent = 'Zapisano.';
  loadDashboard(selectedMonth);
  setTimeout(() => { formMessage.textContent = ''; }, 2200);
});

expenseList.addEventListener('click', async (event) => {
  const receiptToggle = event.target.closest('.receipt-summary-toggle');
  if (receiptToggle) {
    const expanded = receiptToggle.getAttribute('aria-expanded') === 'true';
    receiptToggle.setAttribute('aria-expanded', String(!expanded));
    expenseList.querySelectorAll(`[data-receipt-group="${receiptToggle.dataset.receiptGroup}"]`).forEach((row) => {
      row.hidden = expanded;
    });
    return;
  }
  const button = event.target.closest('.delete-button');
  if (!button) return;
  const response = await fetch(`/api/expenses/${button.dataset.id}`, { method: 'DELETE' });
  if (response.ok) loadDashboard(selectedMonth);
});

loadDashboard().catch(() => { formMessage.textContent = 'Nie udało się połączyć z bazą danych.'; });
updateMonthDisplay();
