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
const recurringInput = document.querySelector('#recurring-input');
const recurringList = document.querySelector('#recurring-list');
const recurringTotal = document.querySelector('#recurring-total');
const recurringSubmit = document.querySelector('#recurring-submit');
const cancelRecurring = document.querySelector('#cancel-recurring');
const recurringMessage = document.querySelector('#recurring-message');
let editingRecurringId = null;
const pieChart = document.querySelector('#pie-chart');
const chartLegend = document.querySelector('#chart-legend');
const projectedSavings = document.querySelector('#projected-savings');
const chartCenter = document.querySelector('#chart-center');
const chartColors = ['#e7765d', '#1f6b4d', '#d2ad5d', '#6d8990', '#b36b85', '#7c8b52', '#c48a57', '#3f6f72'];

// Month selection state
let selectedMonth = new Date();

const prevMonthButton = document.querySelector('#prev-month');
const nextMonthButton = document.querySelector('#next-month');
const selectedMonthDisplay = document.querySelector('#selected-month');

document.querySelector('#current-month').textContent = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date());
dateInput.value = new Date().toISOString().slice(0, 10);

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
  incomeCents = data.income;
  incomeAmount.textContent = formatAmount(data.income);
  recurringTotal.textContent = formatAmount(data.recurring_total);
  projectedSavings.textContent = `${formatAmount(data.projected_savings)} zł`;
  projectedSavings.classList.toggle('negative', data.projected_savings < 0);
  const savingsPercent = data.income > 0 ? data.projected_savings / data.income * 100 : 0;
  chartCenter.textContent = `${Math.round(savingsPercent)}%`;
  const chartExpenses = data.categories.map((category) => ({ name: category.category, amount: category.total }));
  if (data.recurring_total > 0) chartExpenses.push({ name: 'Stałe wydatki', amount: data.recurring_total });
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
      <span>${escapeHtml(expense.name)}</span>
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
    expenseList.innerHTML = data.expenses.map((expense) => `
      <tr>
        <td>${escapeHtml(expense.name)}</td>
        <td>${escapeHtml(expense.category)}</td>
        <td>${formatDate(expense.expense_date)}</td>
        <td>${formatAmount(expense.amount)} zł</td>
        <td><button class="delete-button" data-id="${expense.id}" aria-label="Usuń wydatek" title="Usuń wydatek">×</button></td>
      </tr>`).join('');
  }
}

function resetIncomeForm() {
  editingIncomeId = null;
  incomeForm.reset();
  incomeSubmit.innerHTML = 'Dodaj przychód <span>↗</span>';
  cancelIncome.hidden = true;
}

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

function resetRecurringForm() {
  editingRecurringId = null;
  recurringForm.reset();
  recurringSubmit.innerHTML = 'Dodaj wydatek <span>↗</span>';
  cancelRecurring.hidden = true;
  recurringMessage.textContent = '';
}

recurringList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-recurring-id]');
  const deleteButton = event.target.closest('[data-recurring-delete]');
  if (editButton) {
    const expense = window.dashboardData.recurring_expenses.find((item) => String(item.id) === editButton.dataset.recurringId);
    editingRecurringId = expense.id;
    recurringName.value = expense.name;
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

recurringForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const response = await fetch(editingRecurringId ? `/api/recurring-expenses/${editingRecurringId}` : '/api/recurring-expenses', {
    method: editingRecurringId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: recurringName.value, amount: recurringInput.value }),
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
    body: JSON.stringify({ name: incomeName.value, amount: incomeInput.value }),
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
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  formMessage.textContent = 'Zapisano.';
  loadDashboard(selectedMonth);
  setTimeout(() => { formMessage.textContent = ''; }, 2200);
});

expenseList.addEventListener('click', async (event) => {
  const button = event.target.closest('.delete-button');
  if (!button) return;
  const response = await fetch(`/api/expenses/${button.dataset.id}`, { method: 'DELETE' });
  if (response.ok) loadDashboard(selectedMonth);
});

loadDashboard().catch(() => { formMessage.textContent = 'Nie udało się połączyć z bazą danych.'; });
updateMonthDisplay();
