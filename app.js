// REPLACE WITH YOUR ACTUAL GOOGLE APPS SCRIPT WEB APP URL
const API_URL = 'https://script.google.com/macros/s/AKfycbyCTK9jF4_HBoZCw38NS_V9JnznU-EbFgx0V5k3ARs-w6gG6O3lYB4LvbztN1RE4EUc/exec';


let globalExpenseData = [];
let charts = {};
let dataTable;

$(document).ready(() => {
    document.getElementById('date').valueAsDate = new Date();
    loadData();
});

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

async function loadData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        
        if(data.status === "success") {
            
            // --- AUTO-NORMALIZER: Fixes old data to match the new system ---
            globalExpenseData = data.data.map(row => {
                // 1. Standardize Company Names
                if(row.Company) {
                    let compUpper = row.Company.toString().toUpperCase();
                    if(compUpper.includes('GVR')) row.Company = 'GVR Contractors';
                    if(compUpper.includes('KRI')) row.Company = 'KRiyatech';
                }
                // 2. Clean Amounts (Removes commas, ₹, and text so math works)
                if(row.Amount) {
                    row.Amount = parseFloat(row.Amount.toString().replace(/[^0-9.-]+/g,"")) || 0;
                }
                return row;
            });
            // ----------------------------------------------------------------

            populateFilterDropdowns(); 
            applyFilters();            
        } else {
            showToast("Server returned an error.", "danger");
        }
    } catch (e) {
        showToast("Failed to connect to Google Sheets.", "danger");
    }
}

// Extract unique MMM-YY, Projects, and Users safely
function populateFilterDropdowns() {
    const projects = new Set();
    const users = new Set();
    const monthYearsMap = new Map(); 

    globalExpenseData.forEach(row => {
        // Skip entirely blank rows
        if(!row.Date && !row.Amount && !row.Company) return;

        if(row.Project) projects.add(row.Project.toString().trim());
        if(row.EnteredBy) users.add(row.EnteredBy.toString().trim());
        
        if(row.Date) {
            const d = new Date(row.Date);
            if(!isNaN(d.getTime())) { 
                const mmm_yy = d.toLocaleString('en-US', { month: 'short', year: '2-digit' }).replace(' ', '-');
                const sortVal = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
                monthYearsMap.set(mmm_yy, sortVal);
            }
        }
    });

    const sortedMonthYears = Array.from(monthYearsMap.keys()).sort((a, b) => monthYearsMap.get(b) - monthYearsMap.get(a));
    const mySelect = document.getElementById('filterMonthYear');
    mySelect.innerHTML = '<option value="All">All Months</option>';
    sortedMonthYears.forEach(my => mySelect.innerHTML += `<option value="${my}">${my}</option>`);

    const projSelect = document.getElementById('filterProject');
    projSelect.innerHTML = '<option value="All">All Projects</option>';
    Array.from(projects).sort().forEach(p => projSelect.innerHTML += `<option value="${p}">${p}</option>`);

    const userSelect = document.getElementById('filterUser');
    userSelect.innerHTML = '<option value="All">All Users</option>';
    Array.from(users).sort().forEach(u => userSelect.innerHTML += `<option value="${u}">${u}</option>`);
}

// --- FILTERING LOGIC ---
function applyFilters() {
    const startDateVal = document.getElementById('filterStartDate').value;
    const endDateVal = document.getElementById('filterEndDate').value;
    const fMonthYear = document.getElementById('filterMonthYear').value;
    const fCompany = document.getElementById('filterCompany').value;
    const fProject = document.getElementById('filterProject').value;
    const fUser = document.getElementById('filterUser').value;

    const startDate = startDateVal ? new Date(startDateVal) : null;
    if(startDate) startDate.setHours(0,0,0,0);
    
    const endDate = endDateVal ? new Date(endDateVal) : null;
    if(endDate) endDate.setHours(23,59,59,999);

    const filteredData = globalExpenseData.filter(row => {
        if(!row.Date && !row.Amount && !row.Company) return false;

        const date = new Date(row.Date);
        let dateMatch = true;
        let myMatch = true;
        
        if(!isNaN(date.getTime())) {
            if(startDate && date < startDate) dateMatch = false;
            if(endDate && date > endDate) dateMatch = false;
            const rowMonthYear = date.toLocaleString('en-US', { month: 'short', year: '2-digit' }).replace(' ', '-');
            if(fMonthYear !== "All" && rowMonthYear !== fMonthYear) myMatch = false;
        } else {
            if(startDate || endDate || fMonthYear !== "All") dateMatch = false;
        }

        const compMatch = (fCompany === "All") || (row.Company === fCompany);
        const projMatch = (fProject === "All") || (row.Project === fProject);
        const userMatch = (fUser === "All") || (row.EnteredBy === fUser);

        return dateMatch && myMatch && compMatch && projMatch && userMatch;
    });

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
        total += amt;
        
        if(row.Company) {
            let compKey = row.Company.includes("GVR") ? "GVR Contractors" : "KRiyatech";
            compData[compKey] = (compData[compKey] || 0) + amt;
        }
        
        if(row.PaymentMode) payData[row.PaymentMode] = (payData[row.PaymentMode] || 0) + amt;
        
        const date = new Date(row.Date);
        if(!isNaN(date.getTime())) {
            let monthStr = date.toLocaleString('default', { month: 'short', year: '2-digit' }).replace(' ', '-');
            trendData[monthStr] = (trendData[monthStr] || 0) + amt;
        }
    });

    document.getElementById('kpi-total').textContent = `₹${total.toLocaleString('en-IN')}`;
    document.getElementById('kpi-company').textContent = `GVR: ₹${compData['GVR Contractors'].toLocaleString('en-IN')} | KRI: ₹${compData['KRiyatech'].toLocaleString('en-IN')}`;

    renderCharts(compData, trendData, payData);
}

function renderCharts(comp, trend, pay) {
    const destroyChart = (name) => { if(charts[name]) charts[name].destroy(); }
    Chart.defaults.color = 'var(--text-color)';

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

// --- DATATABLES LOGIC ---
function renderTable(dataToProcess) {
    if(dataTable) dataTable.destroy(); 
    const tbody = document.querySelector('#expenseTable tbody');
    
    tbody.innerHTML = dataToProcess.map(row => {
        const d = new Date(row.Date);
        const displayDate = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN');
        const displayAmt = isNaN(parseFloat(row.Amount)) ? 0 : parseFloat(row.Amount);
        
        return `
        <tr>
            <td><small style="opacity: 0.7;">${row.ExpenseID || '-'}</small></td>
            <td>${displayDate}</td>
            <td><strong>${row.Company || '-'}</strong></td>
            <td>${row.Project || '-'}</td>
            <td>${row.Description || '-'}</td>
            <td class="fw-bold">₹${displayAmt.toLocaleString('en-IN')}</td>
            <td>${row.BillURL ? `<a href="${row.BillURL}" target="_blank" class="btn btn-sm btn-light glass-panel"><i class="fa-solid fa-file-invoice"></i> View</a>` : '<span style="opacity: 0.5;">-</span>'}</td>
        </tr>
    `}).join('');

    dataTable = $('#expenseTable').DataTable({
        dom: '<"row mb-3"<"col-md-6"B><"col-md-6"f>>rt<"row mt-3"<"col-md-6"i><"col-md-6"p>>',
        buttons: [
            { extend: 'copy', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'csv', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'excel', className: 'btn btn-sm btn-light glass-panel' },
            { extend: 'pdf', className: 'btn btn-sm btn-light glass-panel' }
        ],
        order: [[1, 'desc']], 
        pageLength: 8, 
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
        document.getElementById('date').valueAsDate = new Date(); 
        loadData(); 
    } catch(err) {
        showToast("Error submitting expense.", "danger");
    } finally {
        btn.disabled = false; 
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i> Submit Expense';
    }
});
