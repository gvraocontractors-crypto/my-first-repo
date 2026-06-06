const API_URL = 'https://script.google.com/macros/s/AKfycbyCTK9jF4_HBoZCw38NS_V9JnznU-EbFgx0V5k3ARs-w6gG6O3lYB4LvbztN1RE4EUc/exec';

let globalExpenseData = [];
let charts = {};
let dataTable;

$(document).ready(() => {
    document.getElementById('date').valueAsDate = new Date();
    loadData();
});

// --- MOBILE SIDEBAR LOGIC ---
function toggleSidebar() {
    document.getElementById('mainSidebar').classList.toggle('mobile-active');
    document.getElementById('mobileOverlay').classList.toggle('active');
}

// --- NAVIGATION LOGIC ---
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    const titles = { 'dashboard': 'Analytics Overview', 'add-expense': 'Record New Expense', 'reports': 'Exportable Data' };
    document.getElementById('pageTitle').textContent = titles[viewId];
    
    if (window.innerWidth <= 991) toggleSidebar();
}

function toggleTheme() {
    const body = document.documentElement;
    body.setAttribute('data-bs-theme', body.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark');
}

function showToast(msg, type='success') {
    const toastEl = document.getElementById('appToast');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0 shadow-lg glass-panel`;
    document.getElementById('toastMsg').textContent = msg;
    new bootstrap.Toast(toastEl).show();
}

async function loadData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        
        if(data.status === "success") {
            globalExpenseData = data.data.map(row => {
                if(row.Company) {
                    let compUpper = row.Company.toString().toUpperCase();
                    if(compUpper.includes('GVR')) row.Company = 'GVR Contractors';
                    if(compUpper.includes('KRI')) row.Company = 'KRiyatech';
                }
                if(row.Amount) {
                    row.Amount = parseFloat(row.Amount.toString().replace(/[^0-9.-]+/g,"")) || 0;
                }
                return row;
            });
            populateFilterDropdowns(); 
            applyFilters();            
        } else {
            showToast("Server returned an error.", "danger");
        }
    } catch (e) {
        showToast("Failed to connect to server.", "danger");
    }
}

function populateFilterDropdowns() {
    const projects = new Set();
    const users = new Set();
    const monthYearsMap = new Map(); 

    globalExpenseData.forEach(row => {
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
    userSelect.innerHTML = '<option value="All">All</option>';
    Array.from(users).sort().forEach(u => userSelect.innerHTML += `<option value="${u}">${u}</option>`);
}

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
    document.getElementById('kpi-company').innerHTML = `GVR: ₹${compData['GVR Contractors'].toLocaleString('en-IN')} <br> KRI: ₹${compData['KRiyatech'].toLocaleString('en-IN')}`;

    renderCharts(compData, trendData, payData);
}

// --- VIBRANT CHART.JS STYLING ---
function renderCharts(comp, trend, pay) {
    const destroyChart = (name) => { if(charts[name]) charts[name].destroy(); }
    
    // Set global default color to adapt to glassmorphism
    Chart.defaults.color = 'rgba(255, 255, 255, 0.8)';
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    
    const noGridOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } } },
        scales: {
            x: { grid: { display: false, drawBorder: false } },
            y: { grid: { color: 'rgba(255,255,255,0.1)', drawBorder: false }, beginAtZero: true }
        }
    };
    
    const pieOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } } },
        borderWidth: 0,
        cutout: '75%'
    };

    destroyChart('comp');
    charts.comp = new Chart(document.getElementById('companyChart'), {
        type: 'doughnut', 
        data: { 
            labels: Object.keys(comp), 
            datasets: [{ data: Object.values(comp), backgroundColor: ['#00f2fe', '#f093fb'], hoverOffset: 10 }] 
        }, 
        options: { ...pieOptions, plugins: { ...pieOptions.plugins, title: {display: true, text: 'Company Split', font: {size: 16}}}}
    });

    destroyChart('trend');
    charts.trend = new Chart(document.getElementById('trendChart'), {
        type: 'line', 
        data: { 
            labels: Object.keys(trend), 
            datasets: [{ 
                label: 'Monthly Spend', 
                data: Object.values(trend), 
                borderColor: '#4facfe', 
                backgroundColor: 'rgba(79, 172, 254, 0.3)', 
                borderWidth: 3, 
                tension: 0.4, 
                fill: true,
                pointBackgroundColor: '#fff',
                pointRadius: 5
            }] 
        }, 
        options: { ...noGridOptions, plugins: { ...noGridOptions.plugins, title: {display: true, text: 'Expense Trend', font: {size: 16}}}}
    });

    destroyChart('pay');
    charts.pay = new Chart(document.getElementById('paymentChart'), {
        type: 'pie', 
        data: { 
            labels: Object.keys(pay), 
            datasets: [{ data: Object.values(pay), backgroundColor: ['#fa709a', '#fee140', '#00c6fb'], hoverOffset: 10 }] 
        }, 
        options: { ...pieOptions, cutout: '0%', plugins: { ...pieOptions.plugins, title: {display: true, text: 'Payment Methods', font: {size: 16}}}}
    });
}

// --- DATATABLES LOGIC ---
function renderTable(dataToProcess) {
    if(dataTable) dataTable.destroy(); 
    const tbody = document.querySelector('#expenseTable tbody');
    
    tbody.innerHTML = dataToProcess.map(row => {
        const d = new Date(row.Date);
        const displayDate = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
        const displayAmt = isNaN(parseFloat(row.Amount)) ? 0 : parseFloat(row.Amount);
        
        return `
        <tr>
            <td><small class="opacity-50">${row.ExpenseID || '-'}</small></td>
            <td class="text-nowrap">${displayDate}</td>
            <td class="text-nowrap fw-bold text-info">${row.Company || '-'}</td>
            <td>${row.Project || '-'}</td>
            <td>${row.Description || '-'}</td>
            <td class="fw-bold fs-6">₹${displayAmt.toLocaleString('en-IN')}</td>
            <td>${row.BillURL ? `<a href="${row.BillURL}" target="_blank" class="btn btn-sm btn-outline-info rounded-pill px-3"><i class="fa-solid fa-file-invoice"></i> View</a>` : '<span class="opacity-25">-</span>'}</td>
        </tr>
    `}).join('');

    dataTable = $('#expenseTable').DataTable({
        dom: '<"row align-items-center mb-3"<"col-12 col-md-6 mb-2 mb-md-0"B><"col-12 col-md-6"f>>rt<"row align-items-center mt-3"<"col-12 col-md-5 small opacity-75"i><"col-12 col-md-7 d-flex justify-content-md-end justify-content-center mt-2 mt-md-0"p>>',
        buttons: [
            { extend: 'excel', className: 'btn btn-sm btn-light glass-panel px-3 rounded-pill' },
            { extend: 'pdf', className: 'btn btn-sm btn-light glass-panel px-3 rounded-pill' }
        ],
        order: [[1, 'desc']], 
        pageLength: 8, 
        language: { search: "", searchPlaceholder: "Search any record..." }
    });
}

document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; 
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Processing...';
    
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
        enteredBy: document.getElementById('enteredBy').value, 
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
