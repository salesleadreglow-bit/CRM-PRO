import { initSupabase, fetchTransactions, testConnection, signIn, signUp, signOut, getSession, resetPassword, updateUserPassword, getSupabase } from './lib/supabase';
import { calculateRFM } from './lib/rfm';
import { processCSV } from './lib/uploader';
import './style.css';
import * as XLSX from 'xlsx';

// --- State Management ---
let state = {
    transactions: [],
    rfmData: [],
    settings: {
        supabaseUrl: localStorage.getItem('supabaseUrl') || 'https://vedzvlsjxmokairstjou.supabase.co',
        supabaseKey: localStorage.getItem('supabaseKey') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZHp2bHNqeG1va2FpcnN0am91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDE5MDQsImV4cCI6MjA5MzYxNzkwNH0.h5d35pLcy1bcqcevXq_Hxtv423zdL4_9XApoLVUV9vQ',
        r3: parseInt(localStorage.getItem('r3')) || 30,
        r2: parseInt(localStorage.getItem('r2')) || 90,
        f3: parseInt(localStorage.getItem('f3')) || 10,
        f2: parseInt(localStorage.getItem('f2')) || 3,
        m3: parseInt(localStorage.getItem('m3')) || 1000000,
        m2: parseInt(localStorage.getItem('m2')) || 250000,
        stratCore: localStorage.getItem('stratCore') || 'VIP Program & Loyalty Reward - Berikan akses eksklusif dan apresiasi personal.',
        stratGrowth: localStorage.getItem('stratGrowth') || 'Onboarding & Upselling - Tawarkan produk komplementer (bundling) dan edukasi.',
        stratPassive: localStorage.getItem('stratPassive') || 'Reminder & Retargeting - Kirim pengingat stok habis dan promo terbatas.',
        stratChurn: localStorage.getItem('stratChurn') || 'Win-back Campaign & Reactivation - Berikan diskon "Comeback" khusus untuk menarik mereka kembali.'
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

function showModal({ title, message, icon, onConfirm }) {
    const overlay = document.getElementById('custom-modal');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const iconEl = document.getElementById('modal-icon');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    titleEl.textContent = title;
    msgEl.textContent = message;
    iconEl.innerHTML = `<i class="ph ${icon}"></i>`;
    iconEl.style.color = icon.includes('warning') ? 'var(--churn)' : 'var(--primary)';

    overlay.classList.add('active');

    const close = () => overlay.classList.remove('active');

    confirmBtn.onclick = () => { onConfirm(); close(); };
    cancelBtn.onclick = close;
}

// --- DOM Elements (Akan diisi setelah DOM siap) ---
let views, navItems, loader, dbStatus, dbStatusDot, dbStatusText;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Inisialisasi elemen DOM
    views = document.querySelectorAll('.view-section');
    navItems = document.querySelectorAll('.nav-item');
    loader = document.getElementById('loader');
    dbStatus = document.getElementById('db-status');
    if (dbStatus) {
        dbStatusDot = dbStatus.querySelector('.status-dot');
        dbStatusText = dbStatus.querySelector('span');
    }

    // 1. Jalankan Navigasi & Event Listeners DULU
    setupNavigation();
    setupEventListeners();
    loadSettingsIntoUI();
    
    // 2. Baru kemudian cek koneksi & auth
    try {
        if (state.settings.supabaseUrl && state.settings.supabaseKey) {
            const client = initSupabase(state.settings.supabaseUrl, state.settings.supabaseKey);
            
            // Listen for Password Recovery
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    if (document.getElementById('update-password-overlay')) {
                        document.getElementById('update-password-overlay').classList.add('active');
                    }
                }
            });

            await checkAuth();
        } else {
            // Jika benar-benar tidak ada URL/Key (biasanya saat pertama kali setup lokal)
            hideLoader();
            switchView('settings-view');
            showToast("Silakan masukkan konfigurasi Supabase Anda.", "error");
        }
    } catch (err) {
        console.error("Initialization error:", err);
        hideLoader();
        showToast("Gagal menginisialisasi aplikasi. Cek koneksi internet.", "error");
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
    const roleEl = document.querySelector('.user-role');
    const avatarEl = document.querySelector('.avatar');

    if (nameEl) nameEl.textContent = user.email.split('@')[0];
    if (roleEl) roleEl.textContent = 'Authenticated User';
    if (avatarEl) avatarEl.textContent = user.email[0].toUpperCase();
}

// --- Core Functions ---
async function refreshData() {
    showLoader('Sinkronisasi data dengan Supabase...');
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

function renderDashboard(filteredData = null) {
    const rfm = filteredData || state.rfmData;
    const totalItems = rfm.length;
    const totalPages = Math.ceil(totalItems / state.pageSize) || 1;
    
    // Clamp current page
    if (state.currentPageRFM > totalPages) state.currentPageRFM = totalPages;
    if (state.currentPageRFM < 1) state.currentPageRFM = 1;

    // Update Counts (always show global counts)
    const globalRfm = state.rfmData;
    document.getElementById('count-core').textContent = globalRfm.filter(c => c.segmentation === 'Core').length;
    document.getElementById('count-growth').textContent = globalRfm.filter(c => c.segmentation === 'Growth').length;
    document.getElementById('count-passive').textContent = globalRfm.filter(c => c.segmentation === 'Passive').length;
    document.getElementById('count-churn').textContent = globalRfm.filter(c => c.segmentation === 'Churn').length;

    // Slice for pagination
    const start = (state.currentPageRFM - 1) * state.pageSize;
    const paginated = rfm.slice(start, start + state.pageSize);

    // Render Table
    const tbody = document.querySelector('#table-rfm tbody');
    tbody.innerHTML = '';
    
    paginated.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td title="${row.name}">
                <div style="font-weight:600; overflow:hidden; text-overflow:ellipsis">${row.name}</div>
                <div style="font-size:10px;color:var(--text-muted)">${row.customer_id}</div>
            </td>
            <td>${row.last_order}</td>
            <td style="font-weight:600">Rp ${row.revenue.toLocaleString('id-ID')}</td>
            <td>${row.frequency}x</td>
            <td>${row.recency_days} hr</td>
            <td>${row.r}</td>
            <td>${row.f}</td>
            <td>${row.m}</td>
            <td><span class="badge" style="background:rgba(255,255,255,0.05)">${row.score}</span></td>
            <td><span class="badge badge-${row.segmentation.toLowerCase()}">${row.segmentation}</span></td>
        `;
        tbody.appendChild(tr);
    });
    
    // Update Pagination UI
    document.getElementById('rfm-page-num').textContent = `Hal. ${state.currentPageRFM} / ${totalPages}`;
    document.getElementById('rfm-table-info').textContent = `Menampilkan ${start + 1}-${Math.min(start + state.pageSize, totalItems)} dari ${totalItems} pelanggan.`;
    
    document.getElementById('btn-rfm-prev').disabled = (state.currentPageRFM === 1);
    document.getElementById('btn-rfm-next').disabled = (state.currentPageRFM === totalPages);
}

function renderBroadcast() {
    const rfm = state.rfmData;
    const filter = document.getElementById('filter-segment-broadcast').value;
    const filtered = filter === 'all' ? rfm : rfm.filter(c => c.segmentation === filter);
    
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / state.pageSize) || 1;

    // Clamp current page
    if (state.currentPageBroadcast > totalPages) state.currentPageBroadcast = totalPages;
    if (state.currentPageBroadcast < 1) state.currentPageBroadcast = 1;

    const start = (state.currentPageBroadcast - 1) * state.pageSize;
    const paginated = filtered.slice(start, start + state.pageSize);

    const tbody = document.querySelector('#table-broadcast tbody');
    tbody.innerHTML = '';

    paginated.forEach(row => {
        const strategy = state.settings[`strat${row.segmentation}`] || 'Lakukan profiling lebih lanjut.';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td title="${row.name}">${row.name}</td>
            <td style="font-size:11px;color:var(--text-dim);white-space:normal">${row.character}</td>
            <td>${row.phone || '-'}</td>
            <td><span class="badge badge-${row.segmentation.toLowerCase()}">${row.segmentation}</span></td>
            <td style="color:var(--text-dim);font-size:11px;white-space:normal">${strategy}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Pagination UI
    document.getElementById('broadcast-page-num').textContent = `Hal. ${state.currentPageBroadcast} / ${totalPages}`;
    document.getElementById('broadcast-table-info').textContent = `Menampilkan ${start + 1}-${Math.min(start + state.pageSize, totalItems)} dari ${totalItems} pelanggan.`;
    
    document.getElementById('btn-broadcast-prev').disabled = (state.currentPageBroadcast === 1);
    document.getElementById('btn-broadcast-next').disabled = (state.currentPageBroadcast === totalPages);
}

// --- Navigation & UI ---
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            switchView(target);
        });
    });
}

function switchView(viewId) {
    if (!views) return;
    views.forEach(v => v.classList.remove('active'));
    if (navItems) navItems.forEach(n => n.classList.remove('active'));
    
    const targetView = document.getElementById(viewId);
    if (targetView) targetView.classList.add('active');
    
    const navItem = document.querySelector(`[data-target="${viewId}"]`);
    if (navItem) {
        navItem.classList.add('active');
        // Update Header
        const span = navItem.querySelector('span');
        if (span) {
            document.getElementById('view-title').textContent = span.textContent;
        }
    }
}

function showLoader(msg) {
    if (!loader) return;
    const p = loader.querySelector('p');
    if (p) p.textContent = msg;
    loader.classList.add('active');
}

function hideLoader() {
    loader.classList.remove('active');
}

function updateConnectionStatus(online) {
    if (!dbStatusDot || !dbStatusText) return;
    
    if (online) {
        dbStatusDot.className = 'status-dot online';
        dbStatusText.textContent = 'Supabase Terhubung';
    } else {
        dbStatusDot.className = 'status-dot offline';
        dbStatusText.textContent = 'Supabase Terputus';
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Refresh Data
    document.getElementById('btn-refresh').addEventListener('click', refreshData);

    // Settings
    document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
    document.getElementById('btn-test-db').addEventListener('click', testDbConnection);

    // Auth
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('signup-form').addEventListener('submit', handleSignUp);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // Toggle Login/Signup
    document.getElementById('go-to-signup').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-login-mode').classList.add('hidden');
        document.getElementById('auth-signup-mode').classList.remove('hidden');
        document.getElementById('auth-error').textContent = '';
    });

    document.getElementById('go-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('auth-signup-mode').classList.add('hidden');
        document.getElementById('auth-login-mode').classList.remove('hidden');
        document.getElementById('auth-error').textContent = '';
    });

    document.getElementById('go-to-reset').addEventListener('click', handleForgotPassword);

    // Update Password
    document.getElementById('update-password-form').addEventListener('submit', handleUpdatePassword);

    // Upload
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) handleFileUpload(fileInput.files[0]);
        });
    }

    // Broadcast Filter
    const broadcastFilter = document.getElementById('filter-segment-broadcast');
    if (broadcastFilter) {
        broadcastFilter.addEventListener('change', renderBroadcast);
    }

    // Export Excel
    const btnExport = document.getElementById('btn-export-excel');
    if (btnExport) {
        btnExport.addEventListener('click', exportToExcel);
    }

    // Real-time Search
    const searchRfm = document.getElementById('search-rfm');
    if (searchRfm) {
        searchRfm.addEventListener('input', handleSearch);
    }

    // Mobile Menu Toggle
    const btnMenu = document.getElementById('btn-menu-mobile');
    const sidebar = document.querySelector('.sidebar');
    if (btnMenu && sidebar) {
        btnMenu.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // Close sidebar when clicking nav-item (on mobile)
    const navItemsList = document.querySelectorAll('.nav-item');
    navItemsList.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024 && sidebar) {
                sidebar.classList.remove('active');
            }
        });
    });

    // Pagination Controls
    const btnRfmPrev = document.getElementById('btn-rfm-prev');
    const btnRfmNext = document.getElementById('btn-rfm-next');
    const btnBroadcastPrev = document.getElementById('btn-broadcast-prev');
    const btnBroadcastNext = document.getElementById('btn-broadcast-next');

    if (btnRfmPrev) {
        btnRfmPrev.addEventListener('click', () => {
            if (state.currentPageRFM > 1) {
                state.currentPageRFM--;
                renderDashboard();
            }
        });
    }
    if (btnRfmNext) {
        btnRfmNext.addEventListener('click', () => {
            const totalPages = Math.ceil(state.rfmData.length / state.pageSize);
            if (state.currentPageRFM < totalPages) {
                state.currentPageRFM++;
                renderDashboard();
            }
        });
    }

    if (btnBroadcastPrev) {
        btnBroadcastPrev.addEventListener('click', () => {
            if (state.currentPageBroadcast > 1) {
                state.currentPageBroadcast--;
                renderBroadcast();
            }
        });
    }
    if (btnBroadcastNext) {
        btnBroadcastNext.addEventListener('click', () => {
            const filter = document.getElementById('filter-segment-broadcast').value;
            const filteredCount = filter === 'all' ? state.rfmData.length : state.rfmData.filter(c => c.segmentation === filter).length;
            const totalPages = Math.ceil(filteredCount / state.pageSize);
            if (state.currentPageBroadcast < totalPages) {
                state.currentPageBroadcast++;
                renderBroadcast();
            }
        });
    }
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    if (!query) {
        renderDashboard(state.rfmData);
        return;
    }

    const filtered = state.rfmData.filter(c => 
        String(c.name).toLowerCase().includes(query) || 
        String(c.customer_id).toLowerCase().includes(query) || 
        String(c.phone).toLowerCase().includes(query)
    );

    renderDashboard(filtered);
}

// --- Auth Handlers ---
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('auth-error');
    
    errorEl.textContent = '';
    const btn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-circle-notch animate-spin"></i> Menghubungkan...';
    }

    try {
        const { data, error } = await signIn(email, password);
        if (error) throw error;
        
        showToast('Login berhasil!');
        await checkAuth();
    } catch (err) {
        errorEl.textContent = 'Gagal Login: ' + err.message;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-sign-in"></i> Login ke Dashboard';
        }
    }
}

async function handleSignUp(e) {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('auth-error');
    
    errorEl.textContent = '';
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-circle-notch animate-spin"></i> Mendaftarkan...';

    try {
        const { data, error } = await signUp(email, password);
        if (error) throw error;
        
        showToast('Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi jika diperlukan.', 'success');
        
        // If auto-confirm is enabled in Supabase, we can check auth
        if (data.session) {
            await checkAuth();
        } else {
            // Switch back to login
            document.getElementById('go-to-login').click();
            showToast('Akun dibuat. Silakan login.', 'success');
        }
    } catch (err) {
        errorEl.textContent = 'Gagal Daftar: ' + err.message;
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-user-plus"></i> Daftar Akun';
    }
}

async function handleLogout() {
    showModal({
        title: 'Konfirmasi Keluar',
        message: 'Apakah Anda yakin ingin keluar dari sistem?',
        icon: 'ph-warning',
        onConfirm: async () => {
            await signOut();
            location.reload();
        }
    });
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    
    if (!email) {
        showToast('Silakan isi alamat email Anda di kotak login terlebih dahulu.', 'error');
        return;
    }

    showModal({
        title: 'Reset Password',
        message: `Kirim link reset password ke email: ${email}?`,
        icon: 'ph-envelope-simple',
        onConfirm: async () => {
            try {
                const { error } = await resetPassword(email);
                if (error) throw error;
                showToast('Link reset berhasil dikirim! Silakan cek email Anda.', 'success');
            } catch (err) {
                showToast('Gagal mengirim email: ' + err.message, 'error');
            }
        }
    });
}

async function handleUpdatePassword(e) {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const errorEl = document.getElementById('update-password-error');
    
    errorEl.textContent = '';
    const btn = e.target.querySelector('button');
    btn.disabled = true;

    try {
        const { error } = await updateUserPassword(newPassword);
        if (error) throw error;
        
        showToast('Password berhasil diperbarui!', 'success');
        document.getElementById('update-password-overlay').classList.remove('active');
        await checkAuth();
    } catch (err) {
        errorEl.textContent = 'Gagal update password: ' + err.message;
    } finally {
        btn.disabled = false;
    }
}

// --- Excel Export ---
function exportToExcel() {
    const rfm = state.rfmData;
    const filter = document.getElementById('filter-segment-broadcast').value;
    const filtered = filter === 'all' ? rfm : rfm.filter(c => c.segmentation === filter);

    if (filtered.length === 0) {
        alert('Tidak ada data untuk diekspor.');
        return;
    }

    const dataToExport = filtered.map(row => ({
        'Nama Pelanggan': row.name,
        'ID Pelanggan': row.customer_id,
        'No. WhatsApp': row.phone,
        'Revenue': row.revenue,
        'Frequency': row.frequency,
        'Recency (Hari)': row.recency_days,
        'RFM Score': row.score,
        'Segmentasi': row.segmentation,
        'Strategi': state.settings[`strat${row.segmentation}`] || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CRM_Broadcast");

    // Auto-width for columns
    const max_width = dataToExport.reduce((w, r) => Math.max(w, r.Strategi.length), 10);
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 50 } ];

    const timestamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `CRM_Broadcast_${filter}_${timestamp}.xlsx`);
}

// --- Logic Helpers ---
async function handleFileUpload(file) {
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPercent = document.getElementById('progress-percent');
    
    progressContainer.classList.remove('hidden');
    
    try {
        const result = await processCSV(file, (p) => {
            progressBar.style.width = `${p.percent}%`;
            progressStatus.textContent = p.status;
            progressPercent.textContent = `${p.percent}%`;
        });
        
        if (result.errors && result.errors.length > 0) {
            showToast('Selesai dengan beberapa masalah', 'error');
        } else {
            showToast(`Berhasil mengunggah ${result.successCount} transaksi!`, 'success');
        }
        
        await refreshData();
    } catch (err) {
        console.error(err);
        showToast('Gagal memproses file: ' + err.message, 'error');
    } finally {
        setTimeout(() => progressContainer.classList.add('hidden'), 1000);
    }
}

function loadSettingsIntoUI() {
    const s = state.settings;
    document.getElementById('config-supabase-url').value = s.supabaseUrl;
    document.getElementById('config-supabase-key').value = s.supabaseKey;
    document.getElementById('threshold-r3').value = s.r3;
    document.getElementById('threshold-r2').value = s.r2;
    document.getElementById('threshold-f3').value = s.f3;
    document.getElementById('threshold-f2').value = s.f2;
    document.getElementById('threshold-m3').value = s.m3;
    document.getElementById('threshold-m2').value = s.m2;
    document.getElementById('strat-core').value = s.stratCore;
    document.getElementById('strat-growth').value = s.stratGrowth;
    document.getElementById('strat-passive').value = s.stratPassive;
    document.getElementById('strat-churn').value = s.stratChurn;
}

function saveSettings() {
    const s = state.settings;
    s.supabaseUrl = document.getElementById('config-supabase-url').value;
    s.supabaseKey = document.getElementById('config-supabase-key').value;
    s.r3 = parseInt(document.getElementById('threshold-r3').value);
    s.r2 = parseInt(document.getElementById('threshold-r2').value);
    s.f3 = parseInt(document.getElementById('threshold-f3').value);
    s.f2 = parseInt(document.getElementById('threshold-f2').value);
    s.m3 = parseInt(document.getElementById('threshold-m3').value);
    s.m2 = parseInt(document.getElementById('threshold-m2').value);
    s.stratCore = document.getElementById('strat-core').value;
    s.stratGrowth = document.getElementById('strat-growth').value;
    s.stratPassive = document.getElementById('strat-passive').value;
    s.stratChurn = document.getElementById('strat-churn').value;

    localStorage.setItem('supabaseUrl', s.supabaseUrl);
    localStorage.setItem('supabaseKey', s.supabaseKey);
    localStorage.setItem('r3', s.r3);
    localStorage.setItem('r2', s.r2);
    localStorage.setItem('f3', s.f3);
    localStorage.setItem('f2', s.f2);
    localStorage.setItem('m3', s.m3);
    localStorage.setItem('m2', s.m2);
    localStorage.setItem('stratCore', s.stratCore);
    localStorage.setItem('stratGrowth', s.stratGrowth);
    localStorage.setItem('stratPassive', s.stratPassive);
    localStorage.setItem('stratChurn', s.stratChurn);

    initSupabase(s.supabaseUrl, s.supabaseKey);
    showToast('Konfigurasi berhasil disimpan!');
    refreshData();
}

async function testDbConnection() {
    const url = document.getElementById('config-supabase-url').value;
    const key = document.getElementById('config-supabase-key').value;
    const msg = document.getElementById('db-test-msg');
    
    msg.textContent = 'Menghubungkan...';
    msg.style.color = 'var(--text-dim)';
    
    const result = await testConnection(url, key);
    if (result.success) {
        msg.textContent = 'Koneksi Berhasil! Ditemukan data di tabel transactions.';
        msg.style.color = 'var(--core)';
    } else {
        msg.textContent = 'Koneksi Gagal: ' + result.error;
        msg.style.color = 'var(--churn)';
    }
}
