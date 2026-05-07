import { initSupabase, fetchTransactions, testConnection, signIn, signUp, signOut, getSession, resetPassword, updateUserPassword, getSupabase } from './lib/supabase';
import { calculateRFM } from './lib/rfm';
import { processCSV } from './lib/uploader';
import * as XLSX from 'xlsx';

// --- State Management ---
let state = {
    transactions: [],
    rfmData: [],
    settings: {
        supabaseUrl: localStorage.getItem('supabaseUrl') || 'https://vedzvlsjxmokairstjou.supabase.co',
        supabaseKey: localStorage.getItem('supabaseKey') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZHp2bHNqeG1va2FpcnN0am91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDE5MDQsImV4cCI6MjA5MzYxNzkwNH0.h5d35pLcy1bcqcevXq_Hxtv423zdL4_9XApoLVUV9vQ',
        r3: parseInt(localStorage.getItem('r-core')) || 30,
        r2: parseInt(localStorage.getItem('r-growth')) || 90,
        f3: parseInt(localStorage.getItem('f-core')) || 10,
        f2: parseInt(localStorage.getItem('f-growth')) || 3,
        m3: parseInt(localStorage.getItem('m-core')) || 1000000,
        m2: parseInt(localStorage.getItem('m-growth')) || 250000,
        stratCore: localStorage.getItem('msg-core') || 'VIP Program & Loyalty Reward - Berikan akses eksklusif dan apresiasi personal.',
        stratGrowth: localStorage.getItem('msg-growth') || 'Onboarding & Upselling - Tawarkan produk komplementer (bundling) dan edukasi.',
        stratPassive: localStorage.getItem('msg-passive') || 'Reminder & Retargeting - Kirim pengingat stok habis dan promo terbatas.',
        stratChurn: localStorage.getItem('msg-churn') || 'Win-back Campaign & Reactivation - Berikan diskon "Comeback" khusus untuk menarik mereka kembali.'
    },
    currentPageRFM: 1,
    currentPageBroadcast: 1,
    pageSize: 10
};

// --- Custom UI Helpers ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : 'ph-warning-circle';
    toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.5s reverse forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// --- DOM Elements ---
let views, navItems, loader;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    views = document.querySelectorAll('.view-section');
    navItems = document.querySelectorAll('.nav-item');
    loader = document.getElementById('loader');

    setupNavigation();
    setupEventListeners();
    loadSettingsIntoUI();
    
    try {
        if (state.settings.supabaseUrl && state.settings.supabaseKey) {
            initSupabase(state.settings.supabaseUrl, state.settings.supabaseKey);
            await checkAuth();
        } else {
            hideLoader();
            switchView('settings-view');
            showToast("Silakan masukkan konfigurasi Supabase.", "error");
        }
    } catch (err) {
        console.error("Init error:", err);
        hideLoader();
    }
});

async function checkAuth() {
    showLoader('Mengecek sesi login...');
    const { data: { session } } = await getSession();
    
    if (session) {
        document.getElementById('login-overlay').classList.remove('active');
        updateUserInfo(session.user);
        await refreshData();
    } else {
        document.getElementById('login-overlay').classList.add('active');
        hideLoader();
    }
}

function updateUserInfo(user) {
    const nameEl = document.querySelector('.user-name');
    const avatarEl = document.querySelector('.avatar');
    if (nameEl) nameEl.textContent = user.email.split('@')[0];
    if (avatarEl) avatarEl.textContent = user.email[0].toUpperCase();
}

// --- Core Functions ---
async function refreshData() {
    showLoader('Sinkronisasi data...');
    try {
        const data = await fetchTransactions();
        state.transactions = data;
        state.rfmData = calculateRFM(data, state.settings);
        
        renderDashboard();
        renderBroadcast();
        updateConnectionStatus(true);
    } catch (err) {
        console.error(err);
        updateConnectionStatus(false);
    } finally {
        hideLoader();
    }
}

function renderDashboard() {
    const rfm = state.rfmData;
    const searchTerm = document.getElementById('search-rfm').value.toLowerCase();
    
    const filtered = rfm.filter(row => 
        row.name.toLowerCase().includes(searchTerm) || 
        row.segmentation.toLowerCase().includes(searchTerm)
    );

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / state.pageSize) || 1;

    // Update Counts
    document.getElementById('count-core').textContent = state.rfmData.filter(c => c.segmentation === 'Core').length;
    document.getElementById('count-growth').textContent = state.rfmData.filter(c => c.segmentation === 'Growth').length;
    document.getElementById('count-passive').textContent = state.rfmData.filter(c => c.segmentation === 'Passive').length;
    document.getElementById('count-churn').textContent = state.rfmData.filter(c => c.segmentation === 'Churn').length;

    const start = (state.currentPageRFM - 1) * state.pageSize;
    const paginated = filtered.slice(start, start + state.pageSize);

    const tbody = document.querySelector('#table-rfm tbody');
    tbody.innerHTML = '';

    paginated.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.name}</td>
            <td>${row.last_order}</td>
            <td style="font-weight:600">Rp ${row.revenue.toLocaleString('id-ID')}</td>
            <td>${row.frequency}x</td>
            <td>${row.recency_days} hr</td>
            <td>${row.r}</td>
            <td>${row.f}</td>
            <td>${row.m}</td>
            <td>${row.score}</td>
            <td><span class="badge badge-${row.segmentation.toLowerCase()}">${row.segmentation}</span></td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('rfm-info').textContent = `Menampilkan ${paginated.length} dari ${totalItems} data`;
    document.getElementById('rfm-page').textContent = `Hal ${state.currentPageRFM} / ${totalPages}`;
    document.getElementById('btn-rfm-prev').disabled = (state.currentPageRFM === 1);
    document.getElementById('btn-rfm-next').disabled = (state.currentPageRFM === totalPages);
}

function renderBroadcast() {
    const rfm = state.rfmData;
    const searchTerm = document.getElementById('search-broadcast').value.toLowerCase();
    const segmentFilter = document.getElementById('filter-segment-broadcast').value;
    
    let filtered = rfm.filter(c => c.name.toLowerCase().includes(searchTerm));
    if (segmentFilter !== 'all') {
        filtered = filtered.filter(c => c.segmentation === segmentFilter);
    }
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / state.pageSize) || 1;

    const start = (state.currentPageBroadcast - 1) * state.pageSize;
    const paginated = filtered.slice(start, start + state.pageSize);

    const tbody = document.querySelector('#table-broadcast tbody');
    tbody.innerHTML = '';

    paginated.forEach(row => {
        const tr = document.createElement('tr');
        const waLink = `https://wa.me/${row.phone.replace(/[^0-9]/g, '')}`;
        const strategy = state.settings[`strat${row.segmentation}`] || '-';

        tr.innerHTML = `
            <td>${row.name}</td>
            <td>${row.phone}</td>
            <td><span class="badge badge-${row.segmentation.toLowerCase()}">${row.segmentation}</span></td>
            <td style="font-size:11px; color:var(--text-dim)">${row.character || '-'}</td>
            <td style="font-size:11px; color:var(--text-muted)">${strategy}</td>
            <td>
                <a href="${waLink}" target="_blank" class="icon-btn" style="background: #25D366; color: white; border: none; width: 32px; height: 32px;">
                    <i class="ph ph-whatsapp-logo"></i>
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('broadcast-info').textContent = `Menampilkan ${paginated.length} dari ${totalItems} data`;
    document.getElementById('broadcast-page').textContent = `Hal ${state.currentPageBroadcast} / ${totalPages}`;
    document.getElementById('btn-broadcast-prev').disabled = (state.currentPageBroadcast === 1);
    document.getElementById('btn-broadcast-next').disabled = (state.currentPageBroadcast === totalPages);
}

function setupNavigation() {
    const sidebar = document.getElementById('main-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            switchView(target);
        });
    });
}

function switchView(target) {
    navItems.forEach(ni => {
        ni.classList.toggle('active', ni.dataset.target === target);
    });
    views.forEach(v => {
        v.classList.toggle('active', v.id === target);
    });

    const names = {
        'dashboard-view': 'Dashboard RFM',
        'upload-view': 'Upload Data',
        'broadcast-view': 'Master Broadcast',
        'settings-view': 'Konfigurasi Sistem'
    };
    document.getElementById('view-title').textContent = names[target] || 'CRM Dashboard';
}

function setupEventListeners() {
    document.getElementById('btn-sync').addEventListener('click', refreshData);
    document.getElementById('btn-logout').addEventListener('click', () => {
        signOut();
        location.reload();
    });

    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignUp);
    document.getElementById('go-to-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-login-mode').style.display = 'none';
        document.getElementById('auth-signup-mode').style.display = 'block';
    });
    document.getElementById('go-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-signup-mode').style.display = 'none';
        document.getElementById('auth-login-mode').style.display = 'block';
    });
    document.getElementById('btn-reset-config').addEventListener('click', () => {
        localStorage.clear();
        location.reload();
    });

    // Search
    document.getElementById('search-rfm').addEventListener('input', () => {
        state.currentPageRFM = 1;
        renderDashboard();
    });
    document.getElementById('search-broadcast').addEventListener('input', () => {
        state.currentPageBroadcast = 1;
        renderBroadcast();
    });
    document.getElementById('filter-segment-broadcast').addEventListener('change', () => {
        state.currentPageBroadcast = 1;
        renderBroadcast();
    });

    // Pagination
    document.getElementById('btn-rfm-prev').addEventListener('click', () => {
        if (state.currentPageRFM > 1) { state.currentPageRFM--; renderDashboard(); }
    });
    document.getElementById('btn-rfm-next').addEventListener('click', () => {
        const totalPages = Math.ceil(state.rfmData.length / state.pageSize);
        if (state.currentPageRFM < totalPages) { state.currentPageRFM++; renderDashboard(); }
    });

    document.getElementById('btn-broadcast-prev').addEventListener('click', () => {
        if (state.currentPageBroadcast > 1) { state.currentPageBroadcast--; renderBroadcast(); }
    });
    document.getElementById('btn-broadcast-next').addEventListener('click', () => {
        const filter = document.getElementById('filter-segment-broadcast').value;
        const filteredCount = filter === 'all' ? state.rfmData.length : state.rfmData.filter(c => c.segmentation === filter).length;
        const totalPages = Math.ceil(filteredCount / state.pageSize);
        if (state.currentPageBroadcast < totalPages) { state.currentPageBroadcast++; renderBroadcast(); }
    });

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

    // Export
    document.getElementById('btn-export-excel').addEventListener('click', exportToExcel);

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
        loginOverlay.classList.add('active');
        showToast('Berhasil logout');
    });

    // Upload
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileUpload(fileInput.files[0]);
    });
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        const { error } = await signIn(email, password);
        if (error) throw error;
        showToast('Login Berhasil');
        await checkAuth();
    } catch (err) {
        document.getElementById('auth-error').textContent = err.message;
    }
}

async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    try {
        const { error } = await signUp(email, password);
        if (error) throw error;
        showToast('Daftar Berhasil, silakan login');
        document.getElementById('go-to-login').click();
    } catch (err) {
        alert(err.message);
    }
}

async function handleFileUpload(file) {
    const progress = document.getElementById('upload-progress');
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('progress-text');
    const percent = document.getElementById('progress-percent');
    
    progress.classList.remove('hidden');
    try {
        const { data: { session } } = await getSession();
        await processCSV(file, (p) => {
            fill.style.width = `${p.percent}%`;
            text.textContent = p.status;
            percent.textContent = `${p.percent}%`;
        }, session?.user?.id);
        showToast('Upload Berhasil');
        await refreshData();
    } catch (err) {
        showToast('Upload Gagal: ' + err.message, 'error');
    } finally {
        setTimeout(() => progress.classList.add('hidden'), 2000);
    }
}

function loadSettingsIntoUI() {
    const s = state.settings;
    document.getElementById('r-core').value = s.r3;
    document.getElementById('r-growth').value = s.r2;
    document.getElementById('f-core').value = s.f3;
    document.getElementById('f-growth').value = s.f2;
    document.getElementById('m-core').value = s.m3;
    document.getElementById('m-growth').value = s.m2;
    document.getElementById('msg-core').value = s.stratCore;
    document.getElementById('msg-growth').value = s.stratGrowth;
    document.getElementById('msg-passive').value = s.stratPassive;
    document.getElementById('msg-churn').value = s.stratChurn;
}

function saveSettings() {
    localStorage.setItem('r-core', document.getElementById('r-core').value);
    localStorage.setItem('r-growth', document.getElementById('r-growth').value);
    localStorage.setItem('f-core', document.getElementById('f-core').value);
    localStorage.setItem('f-growth', document.getElementById('f-growth').value);
    localStorage.setItem('m-core', document.getElementById('m-core').value);
    localStorage.setItem('m-growth', document.getElementById('m-growth').value);
    localStorage.setItem('msg-core', document.getElementById('msg-core').value);
    localStorage.setItem('msg-growth', document.getElementById('msg-growth').value);
    localStorage.setItem('msg-passive', document.getElementById('msg-passive').value);
    localStorage.setItem('msg-churn', document.getElementById('msg-churn').value);
    showToast('Semua konfigurasi berhasil disimpan!');
    location.reload();
}

function updateConnectionStatus(online) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.connection-status span');
    if (dot) dot.className = `status-dot ${online ? 'online' : 'offline'}`;
    if (text) text.textContent = online ? 'Supabase Terhubung' : 'Koneksi Terputus';
}

function showLoader(msg) {
    if (loader) {
        loader.querySelector('p').textContent = msg;
        loader.classList.add('active');
    }
}

function hideLoader() {
    if (loader) loader.classList.remove('active');
}

// --- Excel Export ---
function exportToExcel() {
    const rfm = state.rfmData;
    const filter = document.getElementById('filter-segment-broadcast').value;
    const filtered = filter === 'all' ? rfm : rfm.filter(c => c.segmentation === filter);

    if (filtered.length === 0) {
        showToast('Tidak ada data untuk diekspor.', 'error');
        return;
    }

    const dataToExport = filtered.map(row => ({
        'Nama Pelanggan': row.name,
        'No. WhatsApp': row.phone,
        'Segmentasi': row.segmentation,
        'Karakter': row.character,
        'Strategi': state.settings[`strat${row.segmentation}`] || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CRM_Broadcast");

    // Columns width
    worksheet["!cols"] = [ 
        { wch: 25 }, // Nama
        { wch: 18 }, // WhatsApp
        { wch: 15 }, // Segment
        { wch: 45 }, // Karakter
        { wch: 50 }  // Strategi
    ];

    const now = new Date();
    const timestamp = now.toISOString().split('T')[0] + '_' + now.getHours() + now.getMinutes();
    XLSX.writeFile(workbook, `CRM_Broadcast_${filter}_${timestamp}.xlsx`);
    showToast('Export Excel berhasil!');
}
