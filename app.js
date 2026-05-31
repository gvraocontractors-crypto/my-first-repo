// REPLACE WITH YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyCTK9jF4_HBoZCw38NS_V9JnznU-EbFgx0V5k3ARs-w6gG6O3lYB4LvbztN1RE4EUc/exec';

// Global variables to hold data and charts
let globalExpenseData = [];
let charts = {};
let dataTable;

// Initialize on page load
$(document).ready(() => {
    loadData();
});

// --- NAVIGATION & UI LOGIC ---
function switchView(viewId) {
    // Hide all sections, remove active class from sidebar
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    
    // Show selected section, add active class
    document.getElementById(viewId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    // Update Page Title
    const titles = { 
        'dashboard': 'Dashboard Analytics', 
        'add-expense': 'Record New Expense', 
        'reports': 'Reports & Exports' 
    };
    document.getElementById('pageTitle').textContent = titles[viewId];
}

function toggleTheme() {
    const body = document.documentElement;
    body.setAttribute('data-bs-theme', body.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
}

function showToast(msg, type='primary') {
    const toastEl = document.getElementById('appToast');
    toastEl.className = `toast align-items-center text-bg-${type} border-0 shadow`;
    document.getElementById('toastMsg').textContent = msg;
    new bootstrap.Toast(toastEl).show();
}

// --- DATA FETCHING ---
async function loadData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if(data.status === "success") {
            globalExpenseData = data.data;
            processDashboard(); // Build charts
            renderTable();      // Build table
        }
    } catch (e) {
        showToast("Failed to load data from server.", "danger");
    }
}

// --- DASHBOARD LOGIC ---
function processDashboard() {
    let total = 0, monthTotal = 0;
    let compData = { "GVR Contractors": 0, "KRiyatech": 0 };
    let trendData = {}, payData = {};
    
    const currentMonth = new Date().getMonth();

    globalExpenseData.forEach(row => {
        let amt = parseFloat(row.Amount) || 0;
        let date = new Date(row.Date);
        
        // Totals
        total += amt;
        if(date.getMonth() === currentMonth) monthTotal += amt;

        // Grouping Data for charts
        compData[row.Company] = (compData[row.Company] || 0) + amt;
        payData[row.PaymentMode] = (payData[row.PaymentMode] || 0) + amt;
        
        let monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        trendData[monthStr] = (trendData[monthStr] || 0) + amt;
    });

    // Update KPI UI text
    document.getElementById('kpi-total').textContent = `₹${total.toLocaleString('en-IN')}`;
    document.getElementById('kpi-month').textContent = `₹${monthTotal.toLocaleString('en-IN')}`;
    document.getElementById('kpi-company').textContent = `GVR: ₹${compData['GVR Contractors'].toLocaleString('en-IN')} | KRI: ₹${compData['KRiyatech'].toLocaleString('en-IN')}`;

    // Render the visual charts
    renderCharts(compData, trendData, payData);
}

function renderCharts(comp, trend, pay) {
    const destroyChart = (name) => { if(charts[name]) charts[name].destroy(); }
    
    // 1. Company Doughnut Chart
    destroyChart('comp');
    charts.comp = new Chart(document.getElementById('companyChart'), {
        type: 'doughnut', 
        data: { 
            labels: Object.keys(comp), 
            datasets: [{ data: Object.values(comp), backgroundColor: ['#4e73df', '#1cc88a'] }] 
        }, 
        options: { plugins: { title: {display: true, text: 'Company Distribution'}}}
    });

    // 2. Trend Bar Chart
    destroyChart('trend');
    charts.trend = new Chart(document.getElementById('trendChart'), {
        type: 'bar', 
        data: { 
            labels: Object.keys(trend), 
            datasets: [{ label: 'Monthly Spend', data: Object.values(trend), backgroundColor: '#36b9cc' }] 
        }, 
        options: { plugins: { title: {display: true, text: 'Monthly Trend'}}}
    });

    // 3. Payment Mode Doughnut Chart
    destroyChart('pay');
    charts.pay = new Chart(document.getElementById('paymentChart'), {
        type: 'doughnut', 
        data: { 
            labels: Object.keys(pay), 
            datasets: [{ data: Object.values(pay), backgroundColor: ['#858796', '#5a5c69', '#2e59d9'] }] 
        }, 
        options: { plugins: { title: {display: true, text: 'Payment Modes'}}}
    });
}

// --- DATATABLES LOGIC ---
function renderTable() {
    if(dataTable) dataTable.destroy(); // Clear old table if it exists
    
    const tbody = document.querySelector('#expenseTable tbody');
    
    // Generate HTML rows from data
    tbody.innerHTML = globalExpenseData.map(row => `
        <tr>
            <td><small class="text-muted">${row.ExpenseID}</small></td>
            <td>${new Date(row.Date).toLocaleDateString()}</td>
            <td><strong>${row.Company}</strong></td>
            <td>${row.Project}</td>
            <td>${row.Description}</td>
            <td class="fw-bold text-success">₹${parseFloat(row.Amount).toLocaleString('en-IN')}</td>
            <td>${row.BillURL ? `<a href="${row.BillURL}" target="_blank" class="btn btn-sm btn-outline-info"><i class="fa-solid fa-file-invoice"></i> View</a>` : '<span class="text-muted">-</span>'}</td>
        </tr>
    `).join('');

    // Initialize DataTable with Export Buttons
    dataTable = $('#expenseTable').DataTable({
        dom: '<"row mb-3"<"col-md-6"B><"col-md-6"f>>rt<"row"<"col-md-6"i><"col-md-6"p>>',
        buttons: [
            { extend: 'copy', className: 'btn btn-sm btn-secondary' },
            { extend: 'csv', className: 'btn btn-sm btn-secondary' },
            { extend: 'excel', className: 'btn btn-sm btn-success' },
            { extend: 'pdf', className: 'btn btn-sm btn-danger' },
            { extend: 'print', className: 'btn btn-sm btn-info' }
        ],
        order: [[1, 'desc']], // Order by date descending by default
        pageLength: 10
    });
}

// --- FORM SUBMISSION LOGIC ---
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Uploading & Saving...';
    
    // Handle File Processing
    const fileInput = document.getElementById('billFile');
    let fileBase64 = null, fileName = null, fileMimeType = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileName = file.name; 
        fileMimeType = file.type;
        // Convert file to Base64 to send to Apps Script
        fileBase64 = await new Promise((res) => { 
            const r = new FileReader(); 
            r.onload = () => res(r.result.split(',')[1]); 
            r.readAsDataURL(file); 
        });
    }

    // Prepare data payload
    const payload = {
        date: document.getElementById('date').value, 
        company: document.getElementById('company').value,
        project: document.getElementById('project').value, 
        description: document.getElementById('description').value, 
        amount: document.getElementById('amount').value,
        paymentMode: document.getElementById('paymentMode').value, 
        transactionId: document.getElementById('transactionId').value,
        enteredBy: document.getElementById('currentUser').value, 
        fileBase64: fileBase64, 
        fileName: fileName, 
        fileMimeType: fileMimeType
    };

    try {
        // Send POST request
        await fetch(API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'addExpense', payload: payload }) 
        });
        
        showToast("Expense Recorded Successfully!", "success");
        e.target.reset(); // Clear the form
        loadData();       // Refresh the dashboard and tables with new data
        
    } catch(err) {
        showToast("Error submitting expense. Check console.", "danger");
        console.error(err);
    } finally {
        // Reset button state
        btn.disabled = false; 
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i> Submit Expense';
    }
});
