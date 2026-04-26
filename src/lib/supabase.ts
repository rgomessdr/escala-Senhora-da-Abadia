import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// If configuration is missing, we alert in the console and provide a placeholder
// to prevent the app from completely crashing on boot, though features will fail.
if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('eyJ') || supabaseAnonKey.length < 20) {
  console.error(
    "⚠️ CONFIGURAÇÃO INCORRETA NO PAINEL SECRETS!\n\n" +
    "Acesse: Engrenagem (Settings) -> Secrets\n" +
    "Configure estas 2 chaves exatamente:\n\n" +
    "1. Nome: VITE_SUPABASE_URL\n" +
    "   Valor: (O seu 'Project URL' do Supabase, ex: https://xyz.supabase.co)\n\n" +
    "2. Nome: VITE_SUPABASE_ANON_KEY\n" +
    "   Valor: (O seu 'anon public' key)\n\n" +
    "💡 DICA: No Supabase, vá em Settings -> API para encontrar esses valores.\n" +
    "Não esqueça de clicar em 'APLICAR ALTERAÇÕES' no final do painel de segredos."
  );
}

// Support for providing just the project ID or full URLs
const cleanUrl = supabaseUrl?.trim()
  .replace(/\/rest\/v1\/?$/, '') // Remove suffix if present
  .replace(/\/$/, ''); // Remove trailing slash

const finalUrl = cleanUrl.includes('.') 
  ? (cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`)
  : (cleanUrl ? `https://${cleanUrl}.supabase.co` : 'https://placeholder-project.supabase.co');

console.log("🔌 Supabase Initializing with URL:", finalUrl);

export const supabase = createClient(finalUrl, supabaseAnonKey?.trim() || 'placeholder-key');

export const checkSupabaseConnection = async () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return { success: false, message: "Faltam as chaves no painel Secrets" };
  }
  try {
    // Tenta uma busca simples para validar a conexão
    const { error } = await supabase.from('servers').select('count', { count: 'exact', head: true });
    
    if (error) {
       // Se o erro for 'PGRST116' (no rows) ou sucesso sem erro, está OK.
       // 'PGRST204' (relation does not exist) significa que a chave está OK mas as tabelas não foram criadas.
       if (error.code === 'PGRST204') {
         return { success: true, message: "Conectado! (Aviso: Tabelas não encontradas)" };
       }
       
       console.warn("Erro de conexão Supabase:", error.message, error.code);
       return { success: false, message: `Erro ${error.code}: ${error.message}` };
    }
    return { success: true, message: "Conectado com sucesso!" };
  } catch (err: any) {
    return { success: false, message: "Erro de rede ou URL inválida" };
  }
};

// Database Helpers
export const db = {
  servers: {
    list: (userId: string) => supabase.from('servers').select('*').eq('owner_id', userId),
    insert: (data: any) => {
      const payload = {
        name: data.name,
        type: data.type,
        active: data.active,
        owner_id: data.ownerId
      };
      return supabase.from('servers').insert(payload).select();
    },
    update: (id: string, data: any) => {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.type !== undefined) payload.type = data.type;
      if (data.active !== undefined) payload.active = data.active;
      return supabase.from('servers').update(payload).eq('id', id);
    },
    delete: (id: string) => supabase.from('servers').delete().eq('id', id),
  },
  masses: {
    list: (userId: string) => supabase.from('masses').select('*').eq('owner_id', userId),
    insert: (data: any) => {
      const payload = {
        title: data.title,
        date: data.date,
        time: data.time,
        location: data.location,
        assignments: data.assignments,
        owner_id: data.ownerId
      };
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
