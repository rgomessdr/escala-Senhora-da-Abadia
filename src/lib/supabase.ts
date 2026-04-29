import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pgfjgvtzvwtrlhhvcomg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZmpndnR6dnd0cmxoaHZjb21nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwNDkyMiwiZXhwIjoyMDkyNzgwOTIyfQ.HBPRBuCJfx7cNoGbI0r5KubPvTj1wEpPjneTvTIIn9A';

// If configuration is missing, we alert in the console
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Usando chaves padrão do Supabase. Para segurança, configure o painel 'Secrets'.");
}

// Support for providing just the project ID or full URLs
const cleanUrl = (supabaseUrl || '').trim()
  .replace(/\/rest\/v1\/?$/, '') 
  .replace(/\/$/, '');

const finalUrl = cleanUrl.includes('.') 
  ? (cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`)
  : (cleanUrl ? `https://${cleanUrl}.supabase.co` : 'https://placeholder-project.supabase.co');

const cleanKey = (supabaseAnonKey || '').trim();

// Security Warning for Clerk Keys
if (cleanKey.startsWith('sb_publishable_') || cleanKey.startsWith('pk_')) {
  console.error("CRITICAL: A chave fornecida parece ser do CLERK, não do SUPABASE. O Supabase Anon Key sempre começa com 'eyJ'.");
}

export const supabase = createClient(finalUrl, cleanKey || 'placeholder-key');

export const checkSupabaseConnection = async () => {
  if (cleanKey.startsWith('sb_publishable_') || cleanKey.startsWith('pk_')) {
    return { success: false, message: "CHAVE INVÁLIDA: Você usou uma chave do Clerk no lugar da chave do Supabase. Use a 'anon/public' key (JWT) que começa com 'eyJ'." };
  }

  try {
    // Tenta uma busca simples em cada tabela para validar a existência do schema
    const results = await Promise.all([
      supabase.from('servers').select('count', { count: 'exact', head: true }),
      supabase.from('masses').select('count', { count: 'exact', head: true }),
      supabase.from('communities').select('count', { count: 'exact', head: true })
    ]);

    for (const { error } of results) {
      if (error) {
        console.error("Erro detectado no banco:", error);
        // PGRST204 = Table not found
        // 42P01 = Relation not found (Postgres code)
        if (error.code === 'PGRST204' || error.code === '42P01') {
          return { success: false, message: "TABELAS FALTANDO: Você precisa rodar o script SQL no painel do Supabase." };
        }
        // If it's a 400 with a message about columns, it might be that the table exists but schema changed
        if (error.code === 'PGRST106') {
          return { success: false, message: "ERRO DE SCHEMA: Rode o script SQL novamente para atualizar as tabelas." };
        }
        return { success: false, message: `Erro DB: ${error.message} (${error.code})` };
      }
    }

    return { success: true, message: "Tudo pronto! Banco de dados conectado." };
  } catch (err: any) {
    return { success: false, message: "Erro de rede ou URL inválida. Verifique os Secrets." };
  }
};

// Database Helpers
export const db = {
  servers: {
    list: () => supabase.from('servers').select('*'),
    insert: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const payload = items.map((item: any) => ({
        name: item.name,
        type: item.type,
        active: item.active !== undefined ? item.active : true,
        email: item.email,
        whatsapp: item.whatsapp,
        birth_date: item.birthDate || item.birth_date,
        owner_id: item.owner_id || item.ownerId
      }));
      return supabase.from('servers').insert(payload).select();
    },
    update: (id: string, data: any) => {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.type !== undefined) payload.type = data.type;
      if (data.active !== undefined) payload.active = data.active;
      if (data.email !== undefined) payload.email = data.email;
      if (data.whatsapp !== undefined) payload.whatsapp = data.whatsapp;
      if (data.birthDate !== undefined) payload.birth_date = data.birthDate;
      return supabase.from('servers').update(payload).eq('id', id);
    },
    delete: (id: string) => supabase.from('servers').delete().eq('id', id),
  },
  communities: {
    list: () => supabase.from('communities').select('*'),
    insert: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const payload = items.map(item => ({
        name: item.name,
        owner_id: item.owner_id || item.ownerId
      }));
      return supabase.from('communities').insert(payload).select();
    },
    update: (id: string, name: string) => supabase.from('communities').update({ name }).eq('id', id),
    delete: (id: string) => supabase.from('communities').delete().eq('id', id),
  },
  masses: {
    list: () => supabase.from('masses').select('*'),
    insert: (data: any) => {
      const items = Array.isArray(data) ? data : [data];
      const payload = items.map((item: any) => ({
        title: item.title,
        date: item.date,
        time: item.time,
        location: item.location,
        assignments: item.assignments || {},
        owner_id: item.owner_id || item.ownerId
      }));
      return supabase.from('masses').insert(payload).select();
    },
    update: (id: string, data: any) => {
      const payload: any = {};
      if (data.title !== undefined) payload.title = data.title;
      if (data.date !== undefined) payload.date = data.date;
      if (data.time !== undefined) payload.time = data.time;
      if (data.location !== undefined) payload.location = data.location;
      if (data.assignments !== undefined) payload.assignments = data.assignments;
      return supabase.from('masses').update(payload).eq('id', id);
    },
    delete: (id: string) => supabase.from('masses').delete().eq('id', id),
  }
};
