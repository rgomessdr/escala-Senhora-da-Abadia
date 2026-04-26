import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pgfjgvtzvwtrlhhvcomg.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBnZmpndnR6dnd0cmxoaHZjb21nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzIwNDkyMiwiZXhwIjoyMDkyNzgwOTIyfQ.HBPRBuCJfx7cNoGbI0r5KubPvTj1wEpPjneTvTIIn9A';

// If configuration is missing, we alert in the console
if (!supabaseUrl && !supabaseAnonKey) {
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

export const supabase = createClient(finalUrl, cleanKey || 'placeholder-key');

export const checkSupabaseConnection = async () => {
  try {
    // Tenta uma busca simples para validar a conexão
    const { error } = await supabase.from('servers').select('count', { count: 'exact', head: true });
    
    if (error) {
       // Se o erro for 'PGRST116' (no rows) ou sucesso sem erro, está OK.
       // 'PGRST204' (relation does not exist) significa que a chave está OK mas as tabelas não foram criadas no SQL Editor.
       if (error.code === 'PGRST204') {
         return { success: false, message: "Conectado! Mas as tabelas (servers/masses) ainda não foram criadas no SQL Editor do Supabase." };
       }
       
       console.warn("Erro de conexão Supabase:", error.message, error.code);
       return { success: false, message: `Erro ${error.code}: ${error.message}` };
    }
    return { success: true, message: "Tudo pronto! Banco de dados conectado." };
  } catch (err: any) {
    return { success: false, message: "Erro de rede ou URL inválida" };
  }
};

// Database Helpers
export const db = {
  servers: {
    list: (userId: string) => supabase.from('servers').select('*').eq('owner_id', userId),
    insert: (data: any) => {
      const isArray = Array.from(data).length !== undefined && typeof data !== 'string';
      const items = isArray ? data : [data];
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
    list: (userId: string) => supabase.from('communities').select('*').eq('owner_id', userId),
    insert: (data: any) => {
      const isArray = Array.isArray(data);
      const items = isArray ? data : [data];
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
    list: (userId: string) => supabase.from('masses').select('*').eq('owner_id', userId),
    insert: (data: any) => {
      const isArray = Array.from(data).length !== undefined && typeof data !== 'string';
      const items = isArray ? data : [data];
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
