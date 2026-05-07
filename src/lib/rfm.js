export function calculateRFM(transactions, settings) {
    if (!transactions || transactions.length === 0) return [];

    const customerMap = {};
    const today = new Date(); // Gunakan hari ini sebagai acuan Recency
    today.setHours(23, 59, 59, 999); // Set ke akhir hari agar perhitungan hari lebih pas

    // Group by customer
    transactions.forEach(tx => {
        const cid = tx.customer_id;
        const date = new Date(tx.created_at);
        const revenue = parseFloat(tx.gross_sales) || 0;

        if (!customerMap[cid]) {
            customerMap[cid] = {
                id: cid,
                name: tx.customer_name || 'Unknown',
                phone: tx.phone_number || '',
                totalRevenue: 0,
                frequency: 0,
                latestDate: new Date(0)
            };
        }

        const c = customerMap[cid];
        c.totalRevenue += revenue;
        c.frequency += 1;
        if (date > c.latestDate) c.latestDate = date;
    });

    const results = Object.values(customerMap).map(c => {
        const diffTime = Math.abs(today - c.latestDate);
        const recencyDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        let rScore = 1;
        if (recencyDays <= settings.r3) rScore = 3;
        else if (recencyDays <= settings.r2) rScore = 2;

        let fScore = 1;
        if (c.frequency >= settings.f3) fScore = 3;
        else if (c.frequency >= settings.f2) fScore = 2;

        let mScore = 1;
        if (c.totalRevenue >= settings.m3) mScore = 3;
        else if (c.totalRevenue >= settings.m2) mScore = 2;

        const rfmScoring = `${rScore}${fScore}${mScore}`;

        // LOGIKA BARU BERBASIS PERILAKU (RULE FINAL UPDATE)
        let segmentation = 'Passive';
        let character = '';

        // 1. CHURN: R = 1 (Prioritas utama risiko)
        if (rScore === 1) {
            segmentation = 'Churn';
            character = 'Sudah lama tidak transaksi, customer tidak aktif, risiko hilang tinggi.';
        }
        // 2. CORE: R = 3 dan F >= 2
        else if (rScore === 3 && fScore >= 2) {
            segmentation = 'Core';
            character = 'Customer paling aktif, sering transaksi, customer inti bisnis, kontribusi revenue tinggi.';
        }
        // 3. GROWTH: (R=3 & F=1) ATAU (R=2 & (F>=2 atau M=3))
        else if ((rScore === 3 && fScore === 1) || (rScore === 2 && (fScore >= 2 || mScore === 3))) {
            segmentation = 'Growth';
            character = 'Customer potensial, mulai berkembang, mulai menunjukkan value, berpotensi menjadi CORE.';
        }
        // 4. PASSIVE: R = 2, F = 1, M <= 2
        else {
            segmentation = 'Passive';
            character = 'Customer biasa, transaksi belum kuat, belum repeat, aktivitas masih rendah.';
        }

        return {
            customer_id: c.id,
            name: c.name,
            phone: c.phone,
            last_order: c.latestDate.toLocaleDateString('id-ID'),
            revenue: c.totalRevenue,
            frequency: c.frequency,
            recency_days: recencyDays,
            r: rScore,
            f: fScore,
            m: mScore,
            score: rfmScoring,
            segmentation: segmentation,
            character: character
        };
    });

    return results;
}
