# CRM PRO - Enterprise Edition

A modern CRM application with Supabase integration and incremental data upload.

## Setup Instructions

### 1. Supabase Database
You need to set up two tables in your Supabase project. Run the following SQL in your Supabase SQL Editor:

```sql
-- 1. Hapus tabel lama jika ada (Hati-hati: Data akan hilang)
-- DROP TABLE IF EXISTS public.transactions;

-- 2. Buat Tabel Transactions di skema PUBLIC
CREATE TABLE public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id TEXT UNIQUE, 
    customer_id TEXT NOT NULL,
    customer_name TEXT,
    phone_number TEXT,
    gross_sales NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Buat Index untuk Kecepatan
CREATE INDEX idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);

-- 4. Penting: Matikan RLS atau Tambah Policy agar data bisa masuk
-- Caranya: Di Dashboard Supabase -> Authentication -> Policies -> transactions -> Disable RLS
-- Atau buat policy "Enable Insert for Anon Users"
```

### 2. Application Configuration
1. Open the application.
2. Navigate to the **Pengaturan** (Settings) menu.
3. Enter your **Supabase URL** and **Anon Key**.
   - **PENTING**: URL harus bersih, contoh: `https://xyz.supabase.co` (JANGAN masukkan `/rest/v1` di belakangnya).
4. Click **Simpan Konfigurasi**.
5. Test the connection using the **Test Koneksi** button.

### 3. Uploading Data
1. Go to the **Upload Data** menu.
2. Drag and drop your CSV file.
3. The application will automatically detect duplicates using the `order_id` (or generate one) and only add new records.

## Features
- **Incremental Upload**: Safely update your database without duplicates.
- **RFM Analysis**: Real-time segmentation (Core, Growth, Passive, Churn).
- **Modern UI**: Dark mode, glassmorphism, and smooth animations.
- **WhatsApp Strategy**: Automated strategies for each customer segment.

## Development
To run locally:
```bash
npm install
npm run dev
```
