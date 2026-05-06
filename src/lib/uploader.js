import Papa from 'papaparse';
import { upsertTransactions } from './supabase';

export async function processCSV(file, onProgress) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rawData = results.data;
                const total = rawData.length;
                
                // Helper to find column by synonyms
                const findCol = (row, synonyms) => {
                    const keys = Object.keys(row);
                    const found = keys.find(k => synonyms.includes(k.toLowerCase().trim()));
                    return found ? row[found] : null;
                };

                // Validate and format data
                const formattedData = rawData.map((row, index) => {
                    const cid = findCol(row, ['customer_id', 'id customer', 'id', 'customer id', 'cid']);
                    const name = findCol(row, ['customer_name', 'nama', 'name', 'nama pelanggan', 'customer name']);
                    const phone = findCol(row, ['phone_number', 'phone', 'whatsapp', 'no hp', 'telepon', 'no. wa']);
                    const sales = findCol(row, ['gross_sales', 'total', 'sales', 'amount', 'nominal', 'penjualan']);
                    const date = findCol(row, ['created_at', 'date', 'tanggal', 'waktu', 'order date']);
                    const oid = findCol(row, ['order_id', 'id order', 'order id', 'no invoice', 'invoice']);

                    return {
                        customer_id: String(cid || name || `CUST-${index}`),
                        customer_name: name || 'Unknown',
                        phone_number: String(phone || ''),
                        gross_sales: parseFloat(String(sales || '0').replace(/[^0-9.-]+/g, '')) || 0,
                        created_at: date ? new Date(date).toISOString() : new Date().toISOString(),
                        order_id: oid || `${cid}-${new Date(date || Date.now()).getTime()}-${index}`
                    };
                });

                console.log('Formatted data for upload:', formattedData);

                onProgress({ status: 'Uploading to Supabase...', percent: 50 });
                
                const { successCount, errors } = await upsertTransactions(formattedData);
                
                if (errors && errors.length > 0) {
                    console.error('Supabase Errors:', errors);
                }

                onProgress({ status: 'Done', percent: 100 });
                resolve({ total, successCount, errors });
            },
            error: (err) => reject(err)
        });
    });
}
