const API_URL = 'https://script.google.com/macros/s/AKfycbyCTK9jF4_HBoZCw38NS_V9JnznU-EbFgx0V5k3ARs-w6gG6O3lYB4LvbztN1RE4EUc/exec';

let globalExpenseData = [];
let globalProjects = [];
let charts = {};
let dataTable;
let editExpenseModalUI;
let editProjectModalUI;

$(document).ready(() => {
    document.getElementById('date').valueAsDate = new Date();
    
    // Initialize Modals
    editExpenseModalUI = new bootstrap.Modal(document.getElementById('editExpenseModal'));
    editProjectModalUI = new bootstrap.Modal(document.getElementById('editProjectModal'));

    const cachedData = localStorage.getItem('gemsDataCache');
    if (cachedData) {
        try {
            processServerData(JSON.parse(cachedData), false);
        } catch(e) {}
    }
    fetchFreshData();
});

// --- UI LOGIC ---
function toggleSidebar() {
    document.getElementById('mainSidebar').classList.toggle('mobile-active');
    document.getElementById('mobileOverlay').classList.toggle('active');
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    event.currentTarget.classList.add('active');
    
    const titles = { 
        'dashboard': 'Analytics Overview', 
        'add-expense': 'Record New Expense', 
        'reports': 'Exportable Data',
        'admin': 'Admin Panel - Manage Projects'
    };
    document.getElementById('pageTitle').textContent = titles[viewId];
    if (window.innerWidth <= 991) toggleSidebar();
}

function toggleTheme() {
    const body = document.documentElement;
    const isDark = body.getAttribute('data-bs-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    body.setAttribute('data-bs-theme', newTheme);
    
    const textColor = newTheme === 'dark' ? '#f1f1f1' : '#2b2b2b';
    const gridColor = newTheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    
    Chart.defaults.color = textColor;
    Object.values(charts).forEach(chart => {
        if (chart.options.plugins.title) chart.options.plugins.title.color = textColor;
        if (chart.options.plugins.legend.labels) chart.options.plugins.legend.labels.color = textColor;
        if (chart.options.scales && chart.options.scales.y) {
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.y.grid.color = gridColor;
        }
        chart.update();
    });
}

function showToast(msg, type='success') {
    const toastEl = document.getElementById('appToast');
    toastEl.className = `toast align-items-center text-white bg-${type} border-0 shadow-lg glass-panel`;
    document.getElementById('toastMsg').textContent = msg;
    new bootstrap.Toast(toastEl).show();
}

// --- DATA FETCHING & PROCESSING ---
async function fetchFreshData() {
    document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin text-primary"></i> Syncing...';
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        
        if(data.status === "success") {
            localStorage.setItem('gemsDataCache', JSON.stringify(data.data));
            processServerData(data.data, true);
            document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-cloud-check text-success"></i> Synced';
        } else {
            document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-cloud-xmark text-danger"></i> Error';
        }
    } catch (e) {
        document.getElementById('syncStatus').innerHTML = '<i class="fa-solid fa-cloud-xmark text-danger"></i> Offline';
    }
}

function processServerData(serverData, isFresh) {
    globalExpenseData = serverData.expenses.map(row => {
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

    globalProjects = serverData.projects || [];
    
    updateProjectDropdowns();
    renderAdminProjects();
    populateFilterDropdowns(); 
    applyFilters();  
}

// --- PROJECT LOGIC (Admin) ---
function updateProjectDropdowns() {
    const mainSelect = document.getElementById('project');
    const editSelect = document.getElementById('editProject');
    
    let html = '<option value="" disabled selected>Select Project...</option>';
    globalProjects.sort().forEach(proj => html += `<option value="${proj}">${proj}</option>`);
    
    mainSelect.innerHTML = html;
    editSelect.innerHTML = html;
}

function renderAdminProjects() {
    const tbody = document.getElementById('projectListBody');
    if (globalProjects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-center opacity-50">No projects added yet.</td></tr>';
        return;
    }
    
    tbody.innerHTML = globalProjects.sort().map(proj => `
        <tr>
            <td class="fw-bold">${proj}</td>
            <td class="text-end text-nowrap">
                <button class="btn btn-sm btn-outline-primary glass-panel border-0 px-2" onclick="openEditProject('${proj}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn btn-sm btn-outline-danger glass-panel border-0 px-2 ms-1" onclick="deleteProject('${proj}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

// --- EDIT/DELETE PROJECTS ---
function openEditProject(projName) {
    document.getElementById('editOldProjectName').value = projName;
    document.getElementById('editNewProjectName').value = projName;
    editProjectModalUI.show();
}

document.getElementById('editProjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveEditProjectBtn');
    btn.disabled = true; btn.innerHTML = 'Saving...';
    
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'editProject', payload: { 
            oldName: document.getElementById('editOldProjectName').value,
            newName: document.getElementById('editNewProjectName').value.trim()
        }})});
        showToast("Project updated successfully!");
        editProjectModalUI.hide();
        fetchFreshData();
    } catch(err) {
        showToast("Error updating project", "danger");
    } finally {
        btn.disabled = false; btn.innerHTML = 'Update Name';
    }
});

async function deleteProject(projName) {
    if(!confirm(`Are you sure you want to permanently delete the project: ${projName}?`)) return;
    
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteProject', payload: { projectName: projName }})});
        showToast("Project deleted.", "danger");
        fetchFreshData();
    } catch(err) {
        showToast("Error deleting project.", "danger");
    }
}


// --- EDIT/DELETE EXPENSES ---
function openEditExpense(id) {
    const expense = globalExpenseData.find(e => e.ExpenseID === id);
    if(!expense) return;

    document.getElementById('editExpenseId').value = expense.ExpenseID;
    
    // Parse date for HTML input
    const d = new Date(expense.Date);
    if(!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        document.getElementById('editDate').value = `${yyyy}-${mm}-${dd}`;
    }

    document.getElementById('editCompany').value = expense.Company;
    document.getElementById('editEnteredBy').value = expense.EnteredBy;
    
    // Ensure project dropdown has the option, even if it was deleted
    let projSelect = document.getElementById('editProject');
    if(!Array.from(projSelect.options).some(opt => opt.value === expense.Project)) {
        projSelect.innerHTML += `<option value="${expense.Project}">${expense.Project}</option>`;
    }
    projSelect.value = expense.Project;
    
    document.getElementById('editDescription').value = expense.Description;
    document.getElementById('editAmount').value = expense.Amount;
    document.getElementById('editPaymentMode').value = expense.PaymentMode;
    document.getElementById('editTransactionId').value = expense.TransactionID || '';
    
    editExpenseModalUI.show();
}

document.getElementById('editExpenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('saveEditExpenseBtn');
    btn.disabled = true; btn.innerHTML = 'Saving...';
    
    const fileInput = document.getElementById('editBillFile');
    let fileBase64 = null, fileName = null, fileMimeType = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        fileName = file.name; fileMimeType = file.type;
        fileBase64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
    }

    const payload = {
        id: document.getElementById('editExpenseId').value,
        date: document.getElementById('editDate').value, 
        company: document.getElementById('editCompany').value,
        project: document.getElementById('editProject').value, 
        description: document.getElementById('editDescription').value, 
        amount: document.getElementById('editAmount').value,
        paymentMode: document.getElementById('editPaymentMode').value, 
        transactionId: document.getElementById('editTransactionId').value,
        enteredBy: document.getElementById('editEnteredBy').value, 
        fileBase64, fileName, fileMimeType
    };

    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'editExpense', payload: payload }) });
        showToast("Expense updated successfully!");
        editExpenseModalUI.hide();
        document.getElementById('editBillFile').value = ""; // clear file input
        fetchFreshData();
    } catch(err) {
        showToast("Error updating expense", "danger");
    } finally {
        btn.disabled = false; btn.innerHTML = 'Save Changes';
    }
});

async function deleteExpense(id) {
    if(!confirm(`Are you sure you want to permanently delete Expense ID: ${id}?`)) return;
    
    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'deleteExpense', payload: { id: id }})});
        showToast("Expense deleted.", "danger");
        fetchFreshData();
    } catch(err) {
        showToast("Error deleting expense.", "danger");
    }
}


// --- ADD NEW PROJECT LOGIC ---
document.getElementById('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitProjectBtn');
    const projectName = document.getElementById('newProjectName').value.trim();
    
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Saving...';

    try {
        await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'addProject', payload: { projectName: projectName } }) });
        showToast("Project Added Successfully!", "success");
        e.target.reset(); 
        fetchFreshData(); 
    } catch(err) {
        showToast("Error adding project.", "danger");
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus me-2"></i> Save Project';
    }
});


// --- DASHBOARD & REPORTS RENDERING ---
function populateFilterDropdowns() {
    const filterProjects = new Set();
    const users = new Set();
    const monthYearsMap = new Map(); 

    globalProjects.forEach(p => filterProjects.add(p));

    globalExpenseData.forEach(row => {
        if(!row.Date && !row.Amount && !row.Company) return;
        if(row.Project) filterProjects.add(row.Project.toString().trim());
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
    Array.from(filterProjects).sort().forEach(p => projSelect.innerHTML += `<option value="${p}">${p}</option>`);

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
        let dateMatch = true; let myMatch = true;
        
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

function renderCharts(comp, trend, pay) {
    const destroyChart = (name) => { if(charts[name]) charts[name].destroy(); }
    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
    const textColor = isDark ? '#f1f1f1' : '#2b2b2b';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
    
    const noGridOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, color: textColor } } },
        scales: {
            x: { grid: { display: false, drawBorder: false }, ticks: { color: textColor } },
            y: { grid: { color: gridColor, drawBorder: false }, ticks: { color: textColor }, beginAtZero: true }
        }
    };
    
    const pieOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true, color: textColor } } },
        borderWidth: 0, cutout: '75%'
    };

    destroyChart('comp');
    charts.comp = new Chart(document.getElementById('companyChart'), {
        type: 'doughnut', 
        data: { labels: Object.keys(comp), datasets: [{ data: Object.values(comp), backgroundColor: ['#00f2fe', '#f093fb'], hoverOffset: 10 }] }, 
        options: { ...pieOptions, plugins: { ...pieOptions.plugins, title: {display: true, text: 'Company Split', font: {size: 16}, color: textColor}}}
    });

    destroyChart('trend');
    charts.trend = new Chart(document.getElementById('trendChart'), {
        type: 'line', 
        data: { labels: Object.keys(trend), datasets: [{ label: 'Monthly Spend', data: Object.values(trend), borderColor: '#4facfe', backgroundColor: 'rgba(79, 172, 254, 0.4)', borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: '#fff', pointRadius: 5 }] }, 
        options: { ...noGridOptions, plugins: { ...noGridOptions.plugins, title: {display: true, text: 'Expense Trend', font: {size: 16}, color: textColor}}}
    });

    destroyChart('pay');
    charts.pay = new Chart(document.getElementById('paymentChart'), {
        type: 'pie', 
        data: { labels: Object.keys(pay), datasets: [{ data: Object.values(pay), backgroundColor: ['#fa709a', '#fee140', '#00c6fb'], hoverOffset: 10 }] }, 
        options: { ...pieOptions, cutout: '0%', plugins: { ...pieOptions.plugins, title: {display: true, text: 'Payment Methods', font: {size: 16}, color: textColor}}}
    });
}

function renderTable(dataToProcess) {
    if(dataTable) dataTable.destroy(); 
    const tbody = document.querySelector('#expenseTable tbody');
    
    // RENDER REPORTS TABLE WITH ACTIONS
    tbody.innerHTML = dataToProcess.map(row => {
        const d = new Date(row.Date);
        const displayDate = isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
        const displayAmt = isNaN(parseFloat(row.Amount)) ? 0 : parseFloat(row.Amount);
        
        return `
        <tr>
            <td><small class="opacity-50">${row.ExpenseID || '-'}</small></td>
            <td class="text-nowrap">${displayDate}</td>
            <td class="text-nowrap fw-bold text-primary">${row.Company || '-'}</td>
            <td>${row.Project || '-'}</td>
            <td>${row.Description || '-'}</td>
            <td class="fw-bold fs-6">₹${displayAmt.toLocaleString('en-IN')}</td>
            <td>${row.BillURL ? `<a href="${row.BillURL}" target="_blank" class="btn btn-sm btn-outline-primary rounded-pill px-3"><i class="fa-solid fa-file-invoice"></i> View</a>` : '<span class="opacity-25">-</span>'}</td>
            <td class="text-nowrap">
                <button class="btn btn-sm btn-outline-secondary glass-panel border-0 px-2" onclick="openEditExpense('${row.ExpenseID}')" title="Edit"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn btn-sm btn-outline-danger glass-panel border-0 px-2 ms-1" onclick="deleteExpense('${row.ExpenseID}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `}).join('');

    dataTable = $('#expenseTable').DataTable({
        dom: '<"row align-items-center mb-3"<"col-12 col-md-6 mb-2 mb-md-0"B><"col-12 col-md-6"f>>rt<"row align-items-center mt-3"<"col-12 col-md-5 small opacity-75"i><"col-12 col-md-7 d-flex justify-content-md-end justify-content-center mt-2 mt-md-0"p>>',
        buttons: [
            { extend: 'excel', className: 'btn btn-sm btn-light glass-panel px-3 rounded-pill', exportOptions: { columns: [0,1,2,3,4,5] } },
            { extend: 'pdf', className: 'btn btn-sm btn-light glass-panel px-3 rounded-pill', exportOptions: { columns: [0,1,2,3,4,5] } }
        ],
        order: [[1, 'desc']], 
        pageLength: 8, 
        language: { search: "", searchPlaceholder: "Search any record..." },
        columnDefs: [ { orderable: false, targets: [6, 7] } ] // Disable sorting on Bill and Actions columns
    });
}

// --- ADD NEW EXPENSE SUBMISSION ---
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i> Processing...';
    
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
        fetchFreshData(); 
    } catch(err) {
        showToast("Error submitting expense.", "danger");
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i> Submit Expense';
    }
});
// ==========================================
// O&M BILLING ENGINE LOGIC
// ==========================================

function initializeBillingCards() {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const startYear = 2026;
    const startMonth = 5; // June is index 5
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    // Calculate months elapsed since June 2026, plus 3 months ahead
    const monthsToGenerate = (currentYear - startYear) * 12 + (currentMonth - startMonth) + 4;
    
    const dynamicMonths = [];
    for (let i = 0; i < monthsToGenerate; i++) {
        let d = new Date(startYear, startMonth + i, 1);
        let mStr = monthNames[d.getMonth()];
        let yStr = d.getFullYear().toString().slice(-2);
        dynamicMonths.push(`${mStr}-${yStr}`); 
    }

    const container = document.getElementById('cardContainer');
    if(!container) return;
    container.innerHTML = ''; 

    dynamicMonths.forEach(month => {
        // Utilizing existing Bootstrap grid & GEMS glass-panel classes
        const col = document.createElement('div');
        col.className = 'col-12 col-md-4 col-lg-3';
        
        const card = document.createElement('div');
        card.className = 'card glass-panel border-0 text-center p-4 h-100 shadow-sm';
        card.style.cursor = 'pointer';
        card.style.transition = 'transform 0.2s';
        card.onmouseover = () => { if(!card.classList.contains('processed')) card.style.transform = 'translateY(-5px)'; };
        card.onmouseout = () => card.style.transform = 'translateY(0)';
        
        card.innerHTML = `
            <h4 class="fw-bold m-0 text-primary">${month}</h4>
            <span class="small opacity-75 mt-2 d-block fw-bold"><i class="fa-solid fa-wand-magic-sparkles me-1"></i> Ready to generate</span>
        `;
        
        card.onclick = () => openBillingModal(month, card);
        col.appendChild(card);
        container.appendChild(col);
    });
}

let activeBillingMonth = null;
let activeBillingCard = null;
let billingModalInstance = null;

function openBillingModal(month, cardElement) {
    if (cardElement.classList.contains('processed') || cardElement.classList.contains('loading')) return; 
    
    activeBillingMonth = month;
    activeBillingCard = cardElement;
    document.getElementById('modalMonthText').innerText = month;
    
    // Trigger Bootstrap Modal
    if (!billingModalInstance) {
        billingModalInstance = new bootstrap.Modal(document.getElementById('confirmBillingModal'));
    }
    billingModalInstance.show();
}

function executeGeneration() {
    billingModalInstance.hide();
    
    const month = activeBillingMonth;
    const cardElement = activeBillingCard;

    // Set UI to loading state
    cardElement.classList.add('loading');
    cardElement.innerHTML = `
        <div class="spinner-border text-primary mb-3" role="status"></div>
        <h5 class="fw-bold m-0">Generating...</h5>
        <span class="small opacity-75 mt-2 d-block">Merging PDFs</span>
    `;

    // Call Backend
    if(typeof google !== 'undefined' && google.script) {
        google.script.run
        .withSuccessHandler((response) => {
            if(response.success) {
                cardElement.classList.remove('loading');
                cardElement.classList.add('processed');
                cardElement.style.backgroundColor = 'rgba(40, 167, 69, 0.05)'; 
                cardElement.innerHTML = `
                    <a href="${response.folderUrl}" target="_blank" class="text-decoration-none text-success h-100 d-flex flex-column justify-content-center align-items-center">
                        <i class="fa-solid fa-circle-check fs-1 mb-2"></i>
                        <h4 class="fw-bold m-0 text-dark">${month}</h4>
                        <span class="small fw-bold mt-2 d-block">📂 Open Folder</span>
                    </a>`;
            } else {
                alert("Error: " + response.error);
                resetBillingCard(cardElement, month);
            }
        })
        .withFailureHandler((error) => {
            alert("Execution failed: " + error);
            resetBillingCard(cardElement, month);
        })
        .processMonthInvoice(month);
    } else {
        alert("GAS backend disconnected. Please run inside Google Apps Script environment.");
        resetBillingCard(cardElement, month);
    }
}

function resetBillingCard(cardElement, month) {
    cardElement.classList.remove('loading', 'processed');
    cardElement.innerHTML = `
        <h4 class="fw-bold m-0 text-primary">${month}</h4>
        <span class="small opacity-75 mt-2 d-block fw-bold"><i class="fa-solid fa-wand-magic-sparkles me-1"></i> Ready to generate</span>
    `;
}

// Ensure cards are generated when DOM is ready
document.addEventListener('DOMContentLoaded', initializeBillingCards);
