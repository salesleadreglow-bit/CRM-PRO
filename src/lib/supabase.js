import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function initSupabase(url, key) {
    if (!url || !key) return null;
    // Clean URL: remove trailing slashes, spaces, and accidental /rest/v1 suffix
    const cleanUrl = url.trim()
        .replace(/\/$/, '')
        .replace(/\/rest\/v1$/, '');
    
    supabase = createClient(cleanUrl, key.trim());
    return supabase;
}

export function getSupabase() {
    return supabase;
}

export async function signIn(email, password) {
    if (!supabase) return { error: 'Supabase not initialized' };
    return await supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(email, password) {
    if (!supabase) return { error: 'Supabase not initialized' };
    return await supabase.auth.signUp({ email, password });
}

export async function resetPassword(email) {
    if (!supabase) return { error: 'Supabase not initialized' };
    return await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });
}

export async function updateUserPassword(new_password) {
    if (!supabase) return { error: 'Supabase not initialized' };
    return await supabase.auth.updateUser({ password: new_password });
}

export async function signOut() {
    if (!supabase) return;
    return await supabase.auth.signOut();
}

export async function getSession() {
    if (!supabase) return { data: { session: null } };
    return await supabase.auth.getSession();
}

export async function testConnection(url, key) {
    try {
        const client = createClient(url, key);
        const { data, error } = await client.from('transactions').select('count', { count: 'exact', head: true });
        if (error) throw error;
        return { success: true, count: data };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export async function fetchTransactions() {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error fetching transactions:', error);
        return [];
    }
    return data;
}

export async function upsertTransactions(records) {
    if (!supabase) return { error: 'Supabase not initialized' };
    
    const chunkSize = 500;
    let successCount = 0;
    let errors = [];

    for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from('transactions')
            .upsert(chunk, { onConflict: 'order_id' })
            .select();
        
        if (error) {
            console.error('Supabase Upsert Error Detailed:', error);
            errors.push({
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
            });
        } else {
            successCount += chunk.length;
        }
    }

    return { successCount, errors };
}
