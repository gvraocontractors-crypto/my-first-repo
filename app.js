// REPLACE WITH YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyCTK9jF4_HBoZCw38NS_V9JnznU-EbFgx0V5k3ARs-w6gG6O3lYB4LvbztN1RE4EUc/exec';


let globalExpenseData = [];
let charts = {};
let dataTable;

// Initialize on page load
$(document).ready(() => {
    loadData();
});

// --- NAVIGATION & UI LOGIC ---
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    const titles = { 'dashboard': 'Dashboard Analytics', 'add-expense': 'Record New Expense', 'reports': 'Reports & Exports' };
    document.getElementById('pageTitle').textContent = titles[viewId];
}

function toggleTheme() {
    const body = document.documentElement;
    body.setAttribute('data-bs-theme', body.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
}

function showToast(msg, type='primary') {
    const toastEl = document.getElementById('appToast');
    toastEl.className = `toast align-items-center text-bg-${type} border-0 shadow glass-panel`;
    document.getElementById('toastMsg').textContent = msg;
    new bootstrap.Toast(toastEl).show();
}

// --- DATA FETCHING & FILTER PREP ---
async function loadData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if(data.status === "success") {
            globalExpenseData = data.data;
            populateFilterDropdowns(); // Fill the Project and User dropdowns
            applyFilters();            // Process data through filters to build charts/tables
        }
    } catch (e) {
        showToast("Failed to load data from server.", "danger");
    }
}

// Extract unique Projects and Users to populate dropdowns
function populateFilterDropdowns() {
    const projects = new Set();
    const users = new Set();

    globalExpenseData.forEach(row => {
        if(row.Project) projects.add(row.Project.trim());
        if(row.EnteredBy) users.add(row.EnteredBy.trim());
    });

    const projSelect = document.getElementById('filterProject');
    projSelect.innerHTML = '<option value="All">All Projects</option>';
    projects.forEach(p => projSelect.innerHTML += `<option value="${p}">${p}</option>`);

    const userSelect = document.getElementById('filterUser');
    userSelect.innerHTML = '<option value="All">All Users</option>';
    users.forEach(u => userSelect.innerHTML += `<option value="${u}">${u}</option>`);
}

// --- FILTERING LOGIC ---
function applyFilters() {
    const fMonth = document.getElementById('filterMonth').value;
    const fCompany = document.getElementById('filterCompany').value;
    const fProject = document.getElementById('filterProject').value;
    const fUser = document.getElementById('filterUser').value;

    const filteredData = globalExpenseData.filter(row => {
        const date = new Date(row.Date);
        const monthMatch = (fMonth === "All") || ((date.getMonth() + 1).toString() === fMonth);
        const compMatch = (fCompany === "All") || (row.Company === fCompany);
        const projMatch = (fProject === "All") || (row.Project === fProject);
        const userMatch = (fUser === "All") || (row.EnteredBy === fUser);

        return monthMatch && compMatch && projMatch && userMatch;
    });

    // Pass only the filtered data to update the UI
    processDashboard(filteredData);
    renderTable(filteredData);
}

// --- DASHBOARD LOGIC ---
function processDashboard(dataToProcess) {
    let total = 0;
    let compData = { "GVR Contractors": 0, "KRiyatech": 0 };
    let trendData = {}, payData = {};

    dataToProcess.forEach(row => {
        let amt = parseFloat(row.Amount) || 0;
        let date = new Date(row.Date);
        
        total += amt;
        compData[row.Company] = (compData[row.Company] || 0) + amt;
        payData[row.PaymentMode] = (payData[row.PaymentMode] || 0) + amt;
        
        let monthStr = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        trendData[monthStr] = (trendData[monthStr] || 0) + amt;
    });

    document.getElementById('kpi-total').textContent = `₹${total.toLocaleString('en-IN')}`;
    document.getElementById('kpi-company').textContent = `GVR: ₹${compData['GVR Contractors'].toLocaleString('en-IN')} | KRI: ₹${compData['KRiyatech'].toLocaleString('en-IN')}`;

    renderCharts(compData, trendData, payData);
}

function renderCharts(comp, trend, pay) {
    const destroyChart = (name) => { if(charts[name]) charts[name].destroy(); }
    
    Chart.defaults.color = 'var(--text-color)'; // Make charts adapt to light/dark mode

    destroyChart('comp');
    charts.comp = new Chart(document.getElementById('companyChart'), {
        type: 'doughnut', 
        data: { labels: Object.keys(comp), datasets: [{ data: Object.values(comp), backgroundColor: ['#a18cd1', '#fbc2eb'], borderWidth: 0 }] }, 
        options: { plugins: { title: {display: true, text: 'Company Distribution'}}, cutout: '70%'}
    });

    destroyChart('trend');
    charts.trend = new Chart(document.getElementById('trendChart'), {
        type: 'bar', 
        data: { labels: Object.keys(trend), datasets: [{ label: 'Filtered Spend', data: Object.values(trend), backgroundColor: 'rgba(255, 255, 255, 0.4)', borderColor: 'rgba(255,255,255,1)', borderWidth: 1, borderRadius: 5 }] }, 
        options: { plugins: { title: {display: true, text: 'Monthly Trend'}}}
    });

    destroyChart('pay');
    charts.pay = new Chart(document.getElementById('paymentChart'), {
        type: 'doughnut', 
        data: { labels: Object.keys(pay), datasets: [{ data: Object.values(pay), backgroundColor: ['#84fab0', '#8fd3f4', '#fccb90'], borderWidth: 0 }] }, 
        options: { plugins: { title: {display: true, text: 'Payment Modes'}}, cutout: '70%'}
    });
}

// --- DATATABLES LOGIC WITH PAGINATION ---
function renderTable(dataToProcess) {
    if(dataTable) dataTable.destroy(); 
    
    const tbody = document.querySelector('#expenseTable tbody');
    
    tbody.innerHTML = dataToProcess.map(row => `
        <tr>
            <td><small style="opacity: 0.7;">${row.ExpenseID}</small></td>
            <td>${new Date(row.Date).toLocaleDateString()}</td>
            <td><strong>${row.Company}</strong></td>
            <td>${row.Project}</td>
            <td>${row.Description}</td>
            <td class="fw-bold">₹${parseFloat(row.Amount).toLocaleString('en-IN')}</td>
            <td>${row.BillURL ? `<a href="${row.BillURL}" target="_blank" class="btn btn-sm btn-light glass-panel"><i class="fa-solid fa-file-invoice"></i> View</a>` : '<span style="opacity: 0.5;">-</span>'}</td>
        </tr>
    `).join('');

    // Pagination is enabled by default. We specify pageLength here.
    dataTable = $('#expenseTable').DataTable({
        dom: '<"row mb-3"<"col-md-6"B><"col-md-6"f>>rt<"row mt-3"<"col-md-6"i><"col-md-6"p>>',
        buttons: [
            { extend: 'copy', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'csv', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'excel', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'pdf', className: 'btn btn-sm btn-light glass-panel' }
        ],
        order: [[1, 'desc']], 
        pageLength: 8, // Shows 8 rows per page (Pagination)
        language: { search: "", searchPlaceholder: "Search records..." }
    });
}

// --- FORM SUBMISSION LOGIC ---
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Uploading...';
    
    const fileInput = document.getElementById('billFile');
    let fileBase64 = null, fileName = null, fileMimeType = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileName = file.name; fileMimeType = file.type;
        fileBase64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
    }

    const payload = {
        date: document.getElementById('date').value, 
        company: document.getElementById('company').value,
        project: document.getElementById('project').value, 
        description: document.getElementById('description').value, 
        amount: document.getElementById('amount').value,
        paymentMode: document.getElementById('paymentMode').value, 
        transactionId: document.getElementById('transactionId').value,
        enteredBy: document.getElementById('currentUser').value, 
        fileBase64, fileName, fileMimeType
    };

    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'addExpense', payload: payload }) });
        showToast("Expense Recorded Successfully!", "success");
        e.target.reset(); 
        loadData(); 
    } catch(err) {
        showToast("Error submitting expense.", "danger");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i> Submit Expense';
    }
});
