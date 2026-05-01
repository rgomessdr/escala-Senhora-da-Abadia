import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  ClipboardList, 
  Plus, 
  Trash2, 
  AlertCircle, 
  CheckCircle2,
  ChevronRight,
  UserPlus,
  Church,
  Clock,
  MapPin,
  AlertTriangle,
  Menu,
  X,
  Search,
  Check,
  LogOut,
  LogIn,
  Loader2,
  Download,
  MoreVertical,
  Layers,
  Share2,
  Phone,
  Mail,
  Edit2,
  Settings,
  User as UserIcon,
  Lock,
  Shield,
  Crown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, db as sdb, checkSupabaseConnection } from './lib/supabase';

import { Server, Mass, View, ServerRole, Community } from './types';
import type { User } from '@supabase/supabase-js';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// URL da Logo Principal
const APP_LOGO_URL = "/logotipo-principal.png";

// Componente de logo - Tenta carregar do banco de dados ou da pasta public
const LogoImage = ({ size = 40, className = "" }: { size?: number, className?: string }) => {
  const [hasError, setHasError] = useState(false);
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'app_logo').single();
        if (!error && data && data.value) {
          setCustomLogo(data.value);
        }
      } catch (err) {
        console.error("Error fetching custom logo:", err);
      }
    };
    fetchLogo();
    
    // Subscribe to changes
    const channel = supabase.channel('logo-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.app_logo' }, (payload: any) => {
        if (payload.new && payload.new.value) {
          setCustomLogo(payload.new.value);
          setHasError(false); // Reset error when logo changes
        }
      })
      .subscribe();
      
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const logoUrl = customLogo || `${APP_LOGO_URL}?v=${Date.now()}`;
  const iconSize = Math.max(16, size / 2);

  return (
    <div 
      className={`flex items-center justify-center overflow-hidden shrink-0 ${className}`} 
      style={{ width: size, height: size }}
      id="main-logo-container"
    >
      {!hasError ? (
        <img 
          src={logoUrl} 
          key={logoUrl}
          alt="Logo Paróquia" 
          className="w-full h-full object-contain"
          onError={(e) => {
            console.warn("LOGO NOT FOUND OR INVALID:", logoUrl);
            setHasError(true);
          }}
        />
      ) : (
        <div className="w-full h-full bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md border border-white/20">
          <Church size={iconSize} />
        </div>
      )}
    </div>
  );
};

function handleSupabaseError(error: any, operationType: OperationType, context: string | null) {
  console.error(`Supabase ${operationType} Error on ${context}:`, error);
  
  let msg = `Erro no banco de dados (${operationType}): ${error.message || 'Erro desconhecido'}`;
  
  // Specific Supabase/PostgREST error codes
  if (error.code === 'PGRST204' || error.code === '42P01') {
    msg = `⚠️ Erro Crítico: A tabela ou recurso '${context}' não foi encontrado no Supabase. \n\nIsso geralmente acontece quando as tabelas ainda não foram criadas. Verifique o código SQL de configuração no início do arquivo App.tsx e execute-o no SQL Editor do Supabase.`;
  } else if (error.code === '42703' || error.code === 'PGRST106') {
    msg = `⚠️ Erro de Schema: Coluna ausente ou incompatível em '${context}'. \n\nVocê provavelmente adicionou um novo campo (como Vínculo Familiar) mas não atualizou o banco de dados. \n\nExecute novamente o script SQL do App.tsx no painel do Supabase para atualizar a estrutura das tabelas.`;
  } else if (error.code === '42501') {
    msg = `⚠️ Erro de Permissão (RLS): Você não tem permissão para realizar esta ação em '${context}'.`;
  } else if (error.code === 'PGRST301' || error.status === 401 || error.status === 403) {
    msg = `⚠️ Erro de Autenticação: Sua chave do Supabase (ANON KEY) é inválida ou expirou. \n\nVerifique se você não colou uma chave do CLERK (que começa com sb_publishable) por engano nos segredos.`;
  }
  
  alert(msg);
  throw error;
}

// --- Configuration ---
const AUTHORIZED_EMAILS = [
  'diogoortega@gmail.com',
  'rodrigo--gomes@hotmail.com',
  'rodrigogomessdr@gmail.com'
];

const SETUP_SQL = `-- ⚠️ IMPORTANTE: DESATIVE A TRADUÇÃO DO NAVEGADOR ANTES DE COPIAR!
-- O código abaixo DEVE estar em INGLÊS para funcionar.

-- ==========================================
-- OPÇÃO A: MIGRAR (Se você já tem dados e só quer o novo campo)
-- ==========================================
-- ALTER TABLE servers ADD COLUMN IF NOT EXISTS family_id TEXT;

-- ==========================================
-- OPÇÃO B: RESET TOTAL (CUIDADO! APAGA TUDO!)
-- ==========================================
-- Descomente as linhas abaixo se quiser recriar tudo do zero:

-- DROP TABLE IF EXISTS masses;
-- DROP TABLE IF EXISTS servers;
-- DROP TABLE IF EXISTS communities;

-- CRIAR TABELAS (Se não existirem)
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('acolito', 'coroinha')),
  active BOOLEAN DEFAULT TRUE,
  email TEXT,
  whatsapp TEXT,
  birth_date DATE,
  family_id TEXT,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS masses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  location TEXT NOT NULL,
  assignments JSONB DEFAULT '{"acolitos": [], "coroinhas": []}'::JSONB,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- SEGURANÇA (RLS)
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE masses ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE ACESSO (Usando IF NOT EXISTS ou drop/create)
DROP POLICY IF EXISTS "Acesso Total Servidores" ON servers;
CREATE POLICY "Acesso Total Servidores" ON servers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Comunidades" ON communities;
CREATE POLICY "Acesso Total Comunidades" ON communities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Missas" ON masses;
CREATE POLICY "Acesso Total Missas" ON masses FOR ALL USING (true) WITH CHECK (true);

-- GERENCIAMENTO DE USUÁRIOS
CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  role TEXT DEFAULT 'usuario' CHECK (role IN ('admin', 'usuario')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir e-mails iniciais com roles
INSERT INTO admin_users (email, role) VALUES 
('diogoortega@gmail.com', 'admin'),
('rodrigo--gomes@hotmail.com', 'admin'),
('rodrigogomessdr@gmail.com', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- TABELA DE CONFIGURAÇÕES DO SISTEMA
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir logo padrão se não existir
INSERT INTO system_settings (key, value) VALUES ('app_logo', '/logotipo-principal.png') ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Qualquer um vê configurações" ON system_settings;
CREATE POLICY "Qualquer um vê configurações" ON system_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Apenas admins editam configurações" ON system_settings;
CREATE POLICY "Apenas admins editam configurações" ON system_settings FOR ALL USING (true); -- Simplificado para o usuário poder configurar

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Qualquer um logado vê admins" ON admin_users;
CREATE POLICY "Qualquer um logado vê admins" ON admin_users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Apenas super admins editam admins" ON admin_users;
CREATE POLICY "Apenas super admins editam admins" ON admin_users FOR ALL USING (
  auth.email() IN ('rodrigogomessdr@gmail.com', 'diogoortega@gmail.com')
);
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [servers, setServers] = useState<Server[]>([]);
  const [masses, setMasses] = useState<Mass[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<{success: boolean, message: string} | null>(null);

  const [showSqlSetup, setShowSqlSetup] = useState(false);
  const [isClerkKey, setIsClerkKey] = useState(false);
  const [authorizedEmails, setAuthorizedEmails] = useState<{email: string, role: string}[]>([]);
  const [userRole, setUserRole] = useState<'admin' | 'usuario' | null>(null);
  const SYSTEM_ADMINS = ['rodrigogomessdr@gmail.com', 'diogoortega@gmail.com', 'rodrigo--gomes@hotmail.com', 'contato@premiasidro.com.br'];
  const isSuperAdmin = user?.email && SYSTEM_ADMINS.includes(user.email.toLowerCase());
  const userRoleValue = userRole || 'usuario';
  const isAdmin = isSuperAdmin || userRoleValue === 'admin';

  // Set user role
  useEffect(() => {
    if (user?.email) {
      const authUser = authorizedEmails.find(a => a.email.toLowerCase() === user.email?.toLowerCase());
      setUserRole(authUser?.role as any || 'usuario');
    }
  }, [user, authorizedEmails]);

  // Connection check
  useEffect(() => {
    // Check if the key looks like a Clerk key
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON || '';
    if (key.startsWith('sb_publishable_') || key.startsWith('pk_')) {
      setIsClerkKey(true);
    }

    const checkConn = async () => {
      try {
        console.log("Checking Supabase connection...");
        const res = await checkSupabaseConnection();
        console.log("Connection result:", res);
        setConnStatus(res);
        if (!res.success && (res.message.includes('não encontrada') || res.message.includes('INVÁLIDA'))) {
          setShowSqlSetup(true);
        }
      } catch (err) {
        console.error("Failed to check connection:", err);
      } finally {
        setLoading(false);
      }
    };

    checkConn();
  }, []);

  const handleEmailLogin = async (email: string, pass: string) => {
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();
    
    // Check if authorized
    const isSystemAdmin = SYSTEM_ADMINS.includes(normalizedEmail);
    const { data: authData } = await supabase.from('admin_users').select('email').eq('email', normalizedEmail).single();
    
    if (!authData && !isSystemAdmin) {
      setAuthError(`O e-mail "${normalizedEmail}" não está autorizado a acessar este sistema.`);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: pass });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Erro ao acessar o sistema.');
    }
  };

  const handleEmailRegister = async (email: string, pass: string, name: string) => {
    setAuthError(null);
    const normalizedEmail = email.trim().toLowerCase();

    // Check authorization first
    const isSystemAdmin = SYSTEM_ADMINS.includes(normalizedEmail);
    const { data: authData } = await supabase.from('admin_users').select('email').eq('email', normalizedEmail).single();
    
    if (!authData && !isSystemAdmin) {
      setAuthError(`O e-mail "${normalizedEmail}" não está autorizado para cadastro.`);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({ 
        email: normalizedEmail, 
        password: pass,
        options: { data: { display_name: name } }
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Erro ao criar conta.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Auth Listener
  useEffect(() => {
    const checkAuthStatus = async (currentUser: User | null) => {
      try {
        if (currentUser && currentUser.email) {
          const normalizedEmail = currentUser.email.toLowerCase();
          const isSystemAdmin = SYSTEM_ADMINS.includes(normalizedEmail);
          const { data } = await supabase.from('admin_users').select('email').eq('email', normalizedEmail).single();
          
          if (!data && !isSystemAdmin) {
            await supabase.auth.signOut();
            setUser(null);
            setAuthError('Usuário não autorizado no banco de dados.');
          } else {
            setUser(currentUser);
          }
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Auth status check failed:", err);
      } finally {
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      checkAuthStatus(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkAuthStatus(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Data Fetching
  const fetchAuthorizedEmails = async () => {
    try {
      const { data, error } = await supabase.from('admin_users').select('email, role');
      if (error) {
        console.warn("Role DB Error:", error.message);
        return;
      }
      setAuthorizedEmails(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    
    try {
      const [serversRes, massesRes, communitiesRes] = await Promise.all([
        sdb.servers.list(),
        sdb.masses.list(),
        sdb.communities.list()
      ]);

      if (serversRes.error) throw serversRes.error;
      if (massesRes.error) throw massesRes.error;
      if (communitiesRes.error) throw communitiesRes.error;

      setServers(serversRes.data.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        active: s.active,
        email: s.email,
        whatsapp: s.whatsapp,
        birthDate: s.birth_date,
        familyId: s.family_id,
        ownerId: s.owner_id
      })));

      setMasses(massesRes.data.map(m => ({
        id: m.id,
        title: m.title,
        date: m.date,
        time: m.time,
        location: m.location,
        assignments: m.assignments,
        ownerId: m.owner_id
      })));

      setCommunities(communitiesRes.data.map(c => ({
        id: c.id,
        name: c.name,
        ownerId: c.owner_id
      })));
    } catch (err: any) {
      console.error("Error fetching data:", err);
      // Tratar erro de permissão (RLS)
      if (err.code === '42501' || err.message?.includes('permission denied') || err.message?.includes('Forbidden')) {
        alert("⚠️ ERRO DE PERMISSÃO: Você precisa configurar as Políticas (RLS) no Supabase. Vá em 'Autentication' -> 'Policies' e libere as tabelas 'servers', 'masses' e 'communities' para usuários logados.");
      }
    }
  };

  useEffect(() => {
    fetchData();
    fetchAuthorizedEmails();
    
    // Set up real-time subscriptions
    if (!user) return;

    const serversSub = supabase.channel('servers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, () => fetchData())
      .subscribe();

    const massesSub = supabase.channel('masses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'masses' }, () => fetchData())
      .subscribe();

    return () => {
      serversSub.unsubscribe();
      massesSub.unsubscribe();
    };
  }, [user]);

  // Statistics
  const serverStats = useMemo(() => {
    const counts: Record<string, number> = {};
    servers.forEach(s => counts[s.id] = 0);
    masses.forEach(m => {
      [...m.assignments.acolitos, ...m.assignments.coroinhas].forEach(id => {
        if (counts[id] !== undefined) counts[id]++;
      });
    });
    return counts;
  }, [servers, masses]);

  const unassignedServers = useMemo(() => {
    return servers.filter(s => serverStats[s.id] === 0);
  }, [servers, serverStats]);

  const [isDeleting, setIsDeleting] = useState(false);

  const clearAllData = async () => {
    if (!user || isDeleting) return;
    if (!window.confirm("ATENÇÃO: Isso apagará TODOS os servidores, missas e comunidades cadastrados. Deseja continuar?")) return;
    
    setIsDeleting(true);
    try {
      // Usar sdb para deletar tudo (ou via supabase direto se preferir, mas sdb é mais consistente)
      const { error: massErr } = await supabase.from('masses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (massErr) throw massErr;

      const { error: serverErr } = await supabase.from('servers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (serverErr) throw serverErr;

      const { error: commErr } = await supabase.from('communities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (commErr) throw commErr;
      
      alert("Todos os dados foram excluídos com sucesso.");
      fetchData();
    } catch (err) {
      console.error("Erro ao excluir dados:", err);
      alert("Erro ao excluir dados. Verifique sua conexão.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Actions
  const addServer = async (data: { name: string, type: ServerRole, email?: string, whatsapp?: string, birthDate?: string }) => {
    if (!user) return;
    try {
      const { error } = await sdb.servers.insert({
        ...data,
        active: true,
        ownerId: user.id
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.CREATE, 'servers');
    }
  };

  const updateServer = async (id: string, data: Partial<Server>) => {
    if (!user) return;
    try {
      const { error } = await sdb.servers.update(id, data);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, 'Servidor');
    }
  };

  const removeServer = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este servidor?")) return;
    try {
      const { error } = await sdb.servers.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, 'Servidor');
    }
  };

  const addCommunity = async (name: string) => {
    if (!user) return;
    try {
      const { error } = await sdb.communities.insert({ name, ownerId: user.id });
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.CREATE, 'communities');
    }
  };

  const updateCommunity = async (id: string, name: string) => {
    if (!user) return;
    try {
      const { error } = await sdb.communities.update(id, name);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, `communities/${id}`);
    }
  };

  const removeCommunity = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir esta comunidade?")) return;
    try {
      const { error } = await sdb.communities.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, `communities/${id}`);
    }
  };

  const addMass = async (title: string, date: string, time: string, location: string) => {
    if (!user) return;
    try {
      const { error } = await sdb.masses.insert({
        title,
        date,
        time,
        location,
        assignments: { acolitos: [], coroinhas: [] },
        ownerId: user.id
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.CREATE, 'masses');
    }
  };

  const removeMass = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir esta missa?")) return;
    try {
      const { error } = await sdb.masses.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, `masses/${id}`);
    }
  };

  const updateMass = async (id: string, data: Partial<Mass>) => {
    if (!user) return;
    try {
      const { error } = await sdb.masses.update(id, data);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, `masses/${id}`);
    }
  };

  const toggleAssignment = async (massId: string, serverId: string, role: ServerRole) => {
    const mass = masses.find(m => m.id === massId);
    const server = servers.find(s => s.id === serverId);
    if (!mass || !server) return;

    const category = role === 'acolito' ? 'acolitos' : 'coroinhas';
    const exists = mass.assignments[category].includes(serverId);

    const updatedList = exists 
      ? mass.assignments[category].filter(id => id !== serverId)
      : [...mass.assignments[category], serverId];

    try {
      const { error } = await sdb.masses.update(massId, {
        assignments: { ...mass.assignments, [category]: updatedList }
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.UPDATE, `masses/${massId}`);
    }
  };

  const getWeekOfMonth = (date: Date) => {
    const day = date.getUTCDate();
    return Math.ceil(day / 7);
  };

  const autoSchedule = async (configs?: Record<string, { acolitos: number, coroinhas: number }>) => {
    if (!user || masses.length === 0 || servers.length === 0) return;
    
    // Process only specific masses if config is provided, otherwise process all
    const massesToProcess = configs 
      ? masses.filter(m => configs[m.id]) 
      : [...masses];

    // Sort masses by date and time to process chronologically
    const sortedMasses = massesToProcess.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date);
      return dateDiff !== 0 ? dateDiff : a.time.localeCompare(b.time);
    });

    const currentStats = { ...serverStats };
    const peopleAssignedOnDate: Record<string, Set<string>> = {}; // date -> set of serverIds

    for (const mass of sortedMasses) {
      if (!peopleAssignedOnDate[mass.date]) peopleAssignedOnDate[mass.date] = new Set();
      
      const isMatriz = mass.location.toLowerCase().includes('matriz');
      const dateObj = new Date(mass.date + 'T00:00:00');
      const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
      const weekOfMonth = getWeekOfMonth(dateObj);
      const isSunday = dayOfWeek === 0;

      // Targets based on rules or config override
      const config = configs ? configs[mass.id] : null;
      const acolitosTarget = config ? config.acolitos : (isMatriz ? 3 : (isSunday ? 2 : 1));
      const coroinhasTarget = config ? config.coroinhas : (isMatriz ? 4 : 2);

      let newAcolitos = [...mass.assignments.acolitos];
      let newCoroinhas = [...mass.assignments.coroinhas];

      const tryAssign = (server: Server, currentAcolitos: string[], currentCoroinhas: string[]) => {
        if (currentAcolitos.includes(server.id) || currentCoroinhas.includes(server.id)) return { allowed: false };
        if (peopleAssignedOnDate[mass.date].has(server.id)) return { allowed: false };

        const n = server.name;
        const loc = mass.location.toLowerCase();
        const t = mass.time;
        
        let isForced = false;

        // --- ACOLITOS RULES ---
        if (server.type === 'acolito') {
          if (n.includes("Andrey Henrique") && !isSunday) return { allowed: false };
          if (n.includes("Júlia Machado") && dayOfWeek === 4) return { allowed: false };
          if (n.includes("Gabrielly Matos") && ![0, 6].includes(dayOfWeek)) return { allowed: false };
          
          if (n.includes("Eric Padilha")) {
            if (dayOfWeek === 3 && weekOfMonth === 1 && loc.includes('matriz') && t === "19:00") isForced = true; 
            if (dayOfWeek === 5 && weekOfMonth === 2 && loc.includes('luzia') && t === "19:00") isForced = true;
            if (dayOfWeek === 6 && weekOfMonth === 3 && loc.includes('pedro') && t === "19:00") isForced = true;
            if (dayOfWeek === 0 && weekOfMonth === 4 && loc.includes('matriz') && t === "10:00") isForced = true;
          }
          if (n.includes("Lara Beatriz")) {
            if (dayOfWeek === 0 && weekOfMonth === 1 && loc.includes('aparecida') && t === "17:00") isForced = true;
            if (dayOfWeek === 0 && (weekOfMonth === 2 || weekOfMonth === 5) && loc.includes('graças') && t === "08:00") isForced = true;
            if (dayOfWeek === 5 && weekOfMonth === 3 && loc.includes('luzia') && t === "19:00") isForced = true;
          }
        }

        // --- COROINHAS RULES ---
        if (server.type === 'coroinha') {
          if (n.includes("Antonio Carlos") && dayOfWeek === 0 && weekOfMonth === 3 && loc.includes('matriz') && t === "07:30") isForced = true;
          if (n.includes("Júlia Prates") && !isSunday) return { allowed: false };
          if (n.includes("Beatriz Barbier") && (!isSunday || weekOfMonth === 3 || t === "07:30" || t === "19:00")) return { allowed: false };
          if (n.includes("Carolina Pasinatto") && (!isSunday || (!loc.includes('matriz') && !loc.includes('aparecida')))) return { allowed: false };
          if (n.includes("Ana Sofia")) {
             if (dayOfWeek === 3 && weekOfMonth === 3 && t === "19:30") isForced = true;
             if (dayOfWeek === 0 && weekOfMonth === 1 && loc.includes('matriz') && t === "10:00") isForced = true;
             if (dayOfWeek === 6 && weekOfMonth === 5 && loc.includes('pedro') && t === "19:00") isForced = true;
             if (dayOfWeek === 2 && weekOfMonth === 2 && loc.includes('caacupe') && t === "19:00") isForced = true;
             if (dayOfWeek === 0 && weekOfMonth === 4 && loc.includes('matriz') && t === "10:00") return { allowed: false };
          }
          
          const count = currentStats[server.id] || 0;
          if (n.includes("Elisa Patron") && count >= 2) return { allowed: false };
          if (n.includes("Luiza Carraro") && count >= 1 && dayOfWeek === 3) return { allowed: false };
          if (n.includes("Maria Fernanda Moraes") && count >= 1) return { allowed: false };
          if (n.includes("Nicole Maria") && count >= 1) return { allowed: false };
          if (n.includes("Renata Valentina") && count >= 1) return { allowed: false };
        }

        return { allowed: true, isForced };
      };

      // Fill Acolitos
      if (newAcolitos.length < acolitosTarget) {
        const needed = acolitosTarget - newAcolitos.length;
        const available = servers
          .map(s => ({ s, ...tryAssign(s, newAcolitos, newCoroinhas) }))
          .filter(res => res.allowed)
          .sort((a, b) => {
            if (a.isForced && !b.isForced) return -1;
            if (!a.isForced && b.isForced) return 1;
            
            let scoreA = currentStats[a.s.id] || 0;
            let scoreB = currentStats[b.s.id] || 0;
            if ((a.s.name.includes("Ana Gabrielly") || a.s.name.includes("Lucas Andreetta") || a.s.name.includes("Pedro Lucas")) && dayOfWeek === 2) scoreA += 5;
            if ((b.s.name.includes("Ana Gabrielly") || b.s.name.includes("Lucas Andreetta") || b.s.name.includes("Pedro Lucas")) && dayOfWeek === 2) scoreB += 5;
            if (a.s.name.includes("Daniel Queiroz") && dayOfWeek === 3) scoreA += 5;
            if (b.s.name.includes("Daniel Queiroz") && dayOfWeek === 3) scoreB += 5;
            return scoreA - scoreB;
          });
        
        const selected = available.slice(0, needed);
        selected.forEach(res => {
          newAcolitos.push(res.s.id);
          currentStats[res.s.id] = (currentStats[res.s.id] || 0) + 1;
          peopleAssignedOnDate[mass.date].add(res.s.id);
        });
      }

      // Fill Coroinhas
      if (newCoroinhas.length < coroinhasTarget) {
        const needed = coroinhasTarget - newCoroinhas.length;
        const available = servers
          .map(s => ({ s, ...tryAssign(s, newAcolitos, newCoroinhas) }))
          .filter(res => res.allowed)
          .sort((a, b) => {
            if (a.isForced && !b.isForced) return -1;
            if (!a.isForced && b.isForced) return 1;
            return (currentStats[a.s.id] || 0) - (currentStats[b.s.id] || 0);
          });
        
        const selected = available.slice(0, needed);
        selected.forEach(res => {
          newCoroinhas.push(res.s.id);
          currentStats[res.s.id] = (currentStats[res.s.id] || 0) + 1;
          peopleAssignedOnDate[mass.date].add(res.s.id);
        });
      }

      try {
        const { error } = await sdb.masses.update(mass.id, {
          assignments: {
            acolitos: newAcolitos,
            coroinhas: newCoroinhas
          }
        });
        if (error) throw error;
      } catch (err) {
        console.error("Error smart-scheduling mass", mass.id, err);
        alert("Erro ao salvar escala automatica. Verifique sua conexão.");
        return;
      }
    }
    fetchData();
    alert("Escala montada com sucesso!");
  };

  const clearSchedule = async () => {
    if (!user || !window.confirm('Deseja realmente limpar TODOS os escalados de todas as missas?')) return;
    for (const mass of masses) {
      try {
        const { error } = await sdb.masses.update(mass.id, {
          assignments: { acolitos: [], coroinhas: [] }
        });
        if (error) throw error;
      } catch (err) {
        console.error("Error clearing mass", mass.id, err);
      }
    }
    fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600" size={40} />
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView 
        onEmailLogin={handleEmailLogin}
        onEmailRegister={handleEmailRegister}
        error={authError}
        onClearError={() => setAuthError(null)}
        connStatus={connStatus}
      />
    );
  }


  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navigation Bar */}
      <nav className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shadow-sm z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <LogoImage size={42} className="transform hover:scale-110 transition-transform" />
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-tight text-slate-800 uppercase leading-none flex items-center gap-2">
              N. Sra. da Abadia • Sidrolândia
              {connStatus && (
                <div 
                  className={`flex items-center gap-2 px-2 py-1 rounded-full text-[10px] uppercase font-bold tracking-tight transition-all cursor-help border ${
                    connStatus.success 
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' 
                      : 'bg-rose-50 text-rose-600 border-rose-100 animate-bounce hover:bg-rose-100'
                  }`}
                  onClick={() => !connStatus.success && setShowSqlSetup(true)}
                  title={connStatus.message}
                >
                  <div className={`w-2 h-2 rounded-full ${connStatus.success ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                  {connStatus.success ? 'Conectado' : 'Erro DB'}
                </div>
              )}
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Rua Sergipe, 240 • Centro • 79170-000</p>
          </div>
        </div>

        {/* View Switcher - Desktop */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <NavTab active={view === 'dashboard'} onClick={() => setView('dashboard')} label="Dashboard" />
          <NavTab active={view === 'members'} onClick={() => setView('members')} label="Membros" />
          <NavTab active={view === 'communities'} onClick={() => setView('communities')} label="Comunidades" />
          <NavTab active={view === 'masses'} onClick={() => setView('masses')} label="Missas" />
          {isSuperAdmin && <NavTab active={view === 'users_admin'} onClick={() => setView('users_admin')} label="Administradores" />}
          <NavTab active={view === 'schedule'} onClick={() => setView('schedule')} label={isAdmin ? "Montar Escala" : "Ver Escalas"} />
          <NavTab active={view === 'profile'} onClick={() => setView('profile')} label={user.user_metadata?.display_name || 'Meu Perfil'} />
        </div>

        {/* User / Logout */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end mr-2">
            <span className="text-xs font-bold text-slate-700">{user.user_metadata?.display_name || 'Usuário'}</span>
            <button onClick={handleSignOut} className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">Sair</button>
          </div>
          <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 uppercase">
            {(user.user_metadata?.display_name?.[0]) || user.email?.[0] || '?'}
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 text-slate-600">
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-64 bg-white shadow-2xl flex flex-col p-6 gap-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b">
                <div className="flex items-center gap-2">
                  <LogoImage size={32} />
                  <span className="font-bold text-slate-800 uppercase tracking-widest text-sm">Escalas</span>
                </div>
                <button onClick={() => setIsSidebarOpen(false)}><X size={24} className="text-slate-400" /></button>
              </div>
              <div className="space-y-2">
                <NavButtonView active={view === 'dashboard'} onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }} icon={<LayoutDashboard size={18} />} label="Dashboard" />
                <NavButtonView active={view === 'members'} onClick={() => { setView('members'); setIsSidebarOpen(false); }} icon={<Users size={18} />} label="Membros" />
                <NavButtonView active={view === 'communities'} onClick={() => { setView('communities'); setIsSidebarOpen(false); }} icon={<MapPin size={18} />} label="Comunidades" />
                <NavButtonView active={view === 'masses'} onClick={() => { setView('masses'); setIsSidebarOpen(false); }} icon={<LogoImage size={18} />} label="Missas" />
                {isSuperAdmin && <NavButtonView active={view === 'users_admin'} onClick={() => { setView('users_admin'); setIsSidebarOpen(false); }} icon={<UserPlus size={18} />} label="Administradores" />}
                <NavButtonView active={view === 'schedule'} onClick={() => { setView('schedule'); setIsSidebarOpen(false); }} icon={<Calendar size={18} />} label="Montagem" />
                <NavButtonView active={view === 'profile'} onClick={() => { setView('profile'); setIsSidebarOpen(false); }} icon={<Settings size={18} />} label="Meu Perfil" />
              </div>
              <div className="mt-auto pt-6 border-t">
                <button onClick={handleSignOut} className="w-full flex items-center gap-3 p-3 text-rose-500 font-bold text-sm hover:bg-rose-50 rounded-xl transition-colors">
                  <LogOut size={18} /> Sair do Sistema
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        {showSqlSetup && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-6 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-6 h-6" />
                <h2 className="font-black uppercase tracking-wider text-sm text-red-700">Configuração do Banco Necessária</h2>
              </div>
              <button 
                onClick={() => setShowSqlSetup(false)}
                className="p-2 hover:bg-red-100 rounded-lg transition-colors text-red-400"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Parece que as tabelas necessárias ainda não existem no seu projeto Supabase. 
                Siga os passos abaixo para corrigir:
              </p>
              <ol className="text-xs text-slate-500 space-y-2 list-decimal ml-4 font-bold">
                <li>Acesse o painel do Supabase do seu projeto.</li>
                {isClerkKey && (
                  <li className="text-red-600 bg-red-100 p-2 rounded border border-red-200">
                    ⚠️ <strong>ATENÇÃO:</strong> Sua chave no painel "Secrets" parece ser uma chave do Clerk (começa com sb_publishable). 
                    Você deve usar a <strong>ANONYMOUS KEY</strong> do Supabase (que começa com <code>eyJ...</code>, encontrada em Settings {'>'} API).
                  </li>
                )}
                <li className="text-red-500 underline">VERIFIQUE se o seu projeto é: {import.meta.env.VITE_SUPABASE_URL || 'Projeto Padrão (pgfjgvtzvwtrlhhvcomg)'}</li>
                <li>No menu lateral, clique em <span className="text-indigo-600">SQL Editor</span>.</li>
                <li>Clique em <span className="text-indigo-600">New Query</span>.</li>
                <li>Cole o código abaixo e clique em <span className="text-indigo-600 font-extrabold underline">RUN</span>.</li>
              </ol>
              
              <div className="relative group">
                <pre className="bg-slate-900 text-slate-300 p-4 rounded-xl text-[10px] font-mono overflow-x-auto max-h-[300px] shadow-inner select-all">
                  {SETUP_SQL}
                </pre>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(SETUP_SQL);
                    alert("SQL copiado!");
                  }}
                  className="absolute top-2 right-2 p-2 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 shadow-lg"
                >
                  Copiar SQL
                </button>
              </div>

              <div className="pt-4 flex justify-between items-center">
                <p className="text-[10px] text-slate-400 italic font-medium">
                  Após executar o script, atualize esta página.
                </p>
                <button 
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 bg-slate-900 text-white rounded-lg font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95"
                >
                  Recarregar App
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`max-w-7xl mx-auto ${view === 'schedule' ? 'h-full flex flex-col' : ''}`}
          >
            {view === 'dashboard' && (
              <DashboardView 
                servers={servers} 
                masses={masses} 
                unassigned={unassignedServers} 
                stats={serverStats} 
                setView={setView} 
                isAdmin={isAdmin}
              />
            )}
            {view === 'members' && <MembersView servers={servers} onAdd={addServer} onUpdate={updateServer} onDelete={removeServer} stats={serverStats} isAdmin={isAdmin} />}
            {view === 'communities' && <CommunitiesView communities={communities} onAdd={addCommunity} onUpdate={updateCommunity} onDelete={removeCommunity} isAdmin={isAdmin} />}
            {view === 'profile' && <ProfileView user={user} />}
            {view === 'users_admin' && isSuperAdmin && (
              <UsersAdminView 
                users={authorizedEmails} 
                onAdd={async (email: string, role: string, pass: string) => {
                  try {
                    // Autorizar no banco
                    await supabase.from('admin_users').insert({ email, role });
                    
                    // Tentar criar conta
                    const { error: signUpError } = await supabase.auth.signUp({ 
                      email, 
                      password: pass,
                      options: { data: { display_name: email.split('@')[0] } } 
                    });

                    if (signUpError) {
                      if (signUpError.message?.toLowerCase().includes('already') || signUpError.status === 400) {
                        alert(`O e-mail ${email} já possui uma conta, mas agora foi autorizado como Administrador.`);
                      } else {
                        throw signUpError;
                      }
                    } else {
                      alert(`Administrador ${email} autorizado. A conta foi criada com a senha informada.`);
                    }
                    
                    fetchAuthorizedEmails();
                  } catch (err: any) {
                    alert("Erro ao autorizar admin: " + err.message);
                    fetchAuthorizedEmails();
                  }
                }} 
                onDelete={(email: string) => {
                  if (window.confirm(`Remover autorização de ${email}? Ele perderá acesso ao painel.`)) {
                    supabase.from('admin_users').delete().eq('email', email).then(() => fetchAuthorizedEmails());
                  }
                }} 
                onUpdate={(oldEmail: string, newEmail: string, role: string) => {
                  supabase.from('admin_users').update({ email: newEmail, role }).eq('email', oldEmail).then(() => {
                    fetchAuthorizedEmails();
                    alert("Dados do administrador atualizados.");
                  });
                }}
              />
            )}
            {view === 'masses' && (
              <MassesView 
                masses={masses} 
                servers={servers} 
                onAdd={addMass} 
                onDelete={removeMass} 
                onUpdate={updateMass} 
                communities={communities}
                isAdmin={isAdmin}
              />
            )}
            {view === 'schedule' && (
              <ScheduleView 
                masses={masses} 
                servers={servers} 
                onToggle={toggleAssignment} 
                stats={serverStats} 
                autoSchedule={autoSchedule} 
                clearSchedule={clearSchedule} 
                isAdmin={isAdmin}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function UsersAdminView({ users, onAdd, onDelete, onUpdate }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 500) { // Limit 500KB for Base64 storage
      alert("A imagem é muito grande. Por favor, escolha uma imagem de até 500KB para melhor performance.");
      return;
    }

    setLogoUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        const { error } = await supabase
          .from('system_settings')
          .upsert({ key: 'app_logo', value: base64String });
        
        if (error) throw error;
        alert("Logo atualizada com sucesso!");
      } catch (err: any) {
        alert("Erro ao salvar logo: " + err.message);
      } finally {
        setLogoUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const resetLogo = async () => {
    if (!window.confirm("Deseja resetar a logo para o padrão do sistema?")) return;
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'app_logo', value: '/logotipo-principal.png' });
      if (error) throw error;
      alert("Logo resetada com sucesso!");
    } catch (err: any) {
      alert("Erro ao resetar logo: " + err.message);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    if (editingEmail) {
      onUpdate(editingEmail, email, 'admin');
      setEditingEmail(null);
    } else {
      if (!password.trim()) {
        alert("Defina uma senha para o novo administrador.");
        return;
      }
      onAdd(email, 'admin', password);
    }

    setEmail('');
    setPassword('');
  };

  const startEdit = (u: any) => {
    setEditingEmail(u.email);
    setEmail(u.email);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Desenvolvedor SmartInfo Tecnologia e Softwares</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Administradores</h1>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                <Shield size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                {editingEmail ? 'Editar Acesso' : 'Autorizar Novo Admin'}
              </h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail da Conta</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="exemplo@gmail.com"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              {!editingEmail && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Provisória</label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all"
                  />
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 ml-1 leading-tight">O usuário poderá entrar com este e-mail e senha.</p>
                </div>
              )}

              <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                <Plus size={16} /> {editingEmail ? 'Salvar Alterações' : 'Criar e Autorizar Admin'}
              </button>
              {editingEmail && (
                <button type="button" onClick={() => { setEditingEmail(null); setEmail(''); }} className="w-full py-3 text-[10px] font-black text-slate-400 uppercase">Cancelar Edição</button>
              )}
            </div>
          </form>

          {/* Logo Configuration Card */}
          <div className="glass-card p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                <Settings size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Logo do Sistema</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex items-center justify-center p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <LogoImage size={100} />
              </div>

              <div className="space-y-4">
                <div className="relative">
                  <input 
                    type="file" 
                    id="logo-upload"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                    disabled={logoUploading}
                  />
                  <label 
                    htmlFor="logo-upload"
                    className={`w-full py-4 rounded-xl border-2 border-indigo-100 text-indigo-600 flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-indigo-50 transition-all ${logoUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {logoUploading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {logoUploading ? 'Enviando...' : 'Carregar Nova Logo'}
                  </label>
                </div>

                <button 
                  onClick={resetLogo}
                  className="w-full py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-rose-500 transition-colors"
                >
                  Resetar para Padrão
                </button>
              </div>
              
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                <p className="text-[9px] text-amber-700 font-bold leading-relaxed uppercase tracking-tight">
                  Dica: Use imagens PNG com fundo transparente. O sistema salva a imagem diretamente no banco de dados para garantir que ela apareça em todos os dispositivos.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="glass-card overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/30">
               <div className="flex items-center gap-2 text-rose-500">
                  <AlertTriangle size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Atenção: Apenas administradores pré-autorizados podem acessar o painel.</span>
               </div>
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="p-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail Administrativo</th>
                  <th className="p-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="p-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u: any) => (
                  <tr key={u.email} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <span className="font-bold text-slate-800 text-sm tracking-tight">{u.email}</span>
                      {u.email === 'rodrigogomessdr@gmail.com' && <span className="ml-2 text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-widest">Sistema</span>}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600">
                        Administrador
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => startEdit(u)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={() => onDelete(u.email)} 
                          disabled={u.email === 'rodrigogomessdr@gmail.com'}
                          className="p-2 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}


// --- Internal Components ---

function NavTab({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
        active ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function NavButtonView({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl font-bold text-sm transition-colors ${
        active ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function AuthView({ 
  onEmailLogin, 
  onEmailRegister,
  error,
  onClearError,
  connStatus
}: { 
  onEmailLogin: (email: string, pass: string) => void,
  onEmailRegister: (email: string, pass: string, name: string) => void,
  error: string | null,
  onClearError: () => void,
  connStatus: { success: boolean, message: string } | null
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      onEmailRegister(email, password, name);
    } else {
      onEmailLogin(email, password);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative overflow-hidden font-sans">
      {/* Decorative Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6 transform hover:scale-105 transition-transform cursor-default relative">
              <LogoImage size={96} className="drop-shadow-2xl" />
              <div className="absolute -top-1 -right-1 bg-amber-400 w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-indigo-900 shadow-sm z-10">
                <span className="text-[10px] font-black">MS</span>
              </div>
            </div>
            <h1 className="text-3xl font-display font-black text-slate-900 tracking-tight text-center">Nossa Senhora da Abadia</h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Paróquia de Sidrolândia • MS</p>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-200/60 shadow-2xl p-8 space-y-6 backdrop-blur-sm bg-white/95 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-slate-400">
              <MapPin size={100} />
            </div>
            
            <div className="text-center space-y-1 relative z-10">
              <h2 className="text-xl font-bold text-slate-800">{isRegistering ? 'Criar Nova Conta' : 'Altar Digital'}</h2>
              <p className="text-xs text-slate-400 font-medium leading-relaxed px-4">
                {isRegistering 
                  ? 'Você deve ser um administrador pré-autorizado para poder cadastrar uma senha.' 
                  : 'Gestão de Escalas da Paróquia Nossa Senhora da Abadia.'}
              </p>
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-xs font-bold"
              >
                <AlertCircle size={16} />
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegistering && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                    placeholder="Seu nome"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{isRegistering ? 'E-mail Autorizado' : 'E-mail Administrativo'}</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                  placeholder="admin@exemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
                <input 
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>

              <button 
                type="submit"
                className={`w-full py-4 ${isRegistering ? 'bg-slate-900' : 'bg-indigo-600'} text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3`}
              >
                {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
                {isRegistering ? 'Cadastrar Minha Senha' : 'Entrar no Sistema'}
              </button>
            </form>

            <div className="text-center pt-2 space-y-4">
              {connStatus && (
                <div className={`text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${connStatus.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${connStatus.success ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {connStatus.success ? 'Banco de Dados Conectado' : 'Erro de Conexão com Banco'}
                </div>
              )}
              <button 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  onClearError();
                }}
                className="text-[11px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
              >
                {isRegistering ? 'Já tenho conta? Entrar agora' : 'Primeiro acesso? Cadastrar senha'}
              </button>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight leading-relaxed max-w-[200px] mx-auto text-center">
                  Desenvolvedor SmartInfo Tecnologia e Softwares
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ 
  servers, 
  masses, 
  unassigned, 
  stats, 
  setView, 
  isAdmin
}: any) {
  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão Global</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Dashboard</h1>
          </div>
        </div>
          <div className="flex gap-3">
            <button onClick={() => setView('schedule')} className="group flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
              <Calendar size={18} className="group-hover:rotate-12 transition-transform" /> Montar Nova Escala
            </button>
          </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCardV2 label="Servidores Ativos" value={servers.length} icon={<Users className="text-indigo-600" />} color="indigo" />
        <StatCardV2 label="Missas Planejadas" value={masses.length} icon={<LogoImage size={24} />} color="blue" />
        <StatCardV2 label="Pendências de Equilíbrio" value={unassigned.length} icon={<AlertCircle className="text-rose-600" />} color="rose" alert={unassigned.length > 0} />
      </div>

      <div className="glass-card p-6 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl flex flex-col md:flex-row items-center justify-between gap-8 border-0 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10 w-full md:w-auto text-center md:text-left">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-inner overflow-hidden">
            <LogoImage size={60} />
          </div>
          <div className="space-y-1">
            <h3 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest leading-none">Dados Institucionais</h3>
            <h2 className="text-2xl font-display font-black tracking-tight text-white">Paróquia Nossa Senhora da Abadia</h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-tight">
                <MapPin size={12} className="text-indigo-400" /> Rua Sergipe, 240, Centro, Sidrolândia
              </span>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-tight">
                <Shield size={12} className="text-indigo-400" /> Arquidiocese de Campo Grande
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 relative z-10 w-full md:w-auto">
          <div className="flex flex-col bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10 min-w-[160px]">
            <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1">Pároco</span>
            <span className="text-sm font-bold text-white uppercase leading-tight">Frei Paulo Henrique Rodrighero</span>
            <span className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-tighter">OFMCap</span>
          </div>
          <div className="flex flex-col bg-white/5 backdrop-blur-sm p-4 rounded-2xl border border-white/10 min-w-[160px]">
            <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1">Vigário</span>
            <span className="text-sm font-bold text-white uppercase leading-tight">Frei Everaldo Teixeira do Couto</span>
            <span className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-tighter">OFMCap</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Right Section: Alerts */}
        <div className="glass-card rounded-2xl flex flex-col h-fit overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Alertas de Equilíbrio</h2>
            {unassigned.length > 0 && <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg">AÇÃO REQUERIDA</span>}
          </div>
          
          <div className="p-6">
            {unassigned.length > 0 ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <div className="w-2 h-2 rounded-full bg-rose-500" />
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-tighter">Membros sem nenhuma participação</span>
                </div>
                <div className="space-y-1">
                  {unassigned.slice(0, 5).map((s: any) => (
                    <div key={s.id} className="group flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 transition-all shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-xs uppercase group-hover:bg-indigo-50 group-hover:text-indigo-600">
                          {s.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{s.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.type}</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-rose-300 group-hover:text-rose-500 uppercase italic">Pendência</span>
                    </div>
                  ))}
                  {unassigned.length > 5 && <p className="text-center text-[10px] text-slate-400 pt-2 font-bold uppercase tracking-widest">+ {unassigned.length - 5} outros membros</p>}
                </div>
                <button onClick={() => setView('schedule')} className="w-full mt-2 flex items-center justify-center gap-2 p-4 bg-slate-900 text-white rounded-xl font-bold text-xs tracking-[0.1em] uppercase hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                  Distribuir Escalas <ChevronRight size={14} />
                </button>
              </div>
            ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-4 border border-emerald-100">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="font-bold text-slate-800">Equilibrio Perfeito</h3>
                  <p className="text-xs text-slate-400 mt-2 px-6">Todos os servidores cadastrados possuem pelo menos uma escala ativa.</p>
                </div>
            )}
          </div>
        </div>

        {/* Central Section: Statistics Charts/List */}
        <div className="xl:col-span-2 glass-card rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Frequência de Escalas</h2>
            <button onClick={() => setView('members')} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest transition-colors">Relatório Completo</button>
          </div>
          <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
               <FrequencyList title="Top Participantes" items={servers.sort((a:any, b:any) => (stats[b.id] || 0) - (stats[a.id] || 0)).slice(0, 4)} stats={stats} />
               <FrequencyList title="Menor Participação" items={servers.sort((a:any, b:any) => (stats[a.id] || 0) - (stats[b.id] || 0)).slice(0, 4)} stats={stats} />
            </div>
            
            <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
              <div className="flex gap-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Média Mensal</span>
                  <span className="text-2xl font-black text-slate-800">1.8 <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Escalas/Membro</span></span>
                </div>
                <div className="w-px h-10 bg-slate-200 mt-2" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cobertura</span>
                  <span className="text-2xl font-black text-slate-800">92% <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Vagas Preenchidas</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ user }: { user: any }) {
  const [displayName, setDisplayName] = useState(user.user_metadata?.display_name || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      });
      if (error) throw error;
      setMsg({ type: 'success', text: 'Nome de exibição atualizado com sucesso!' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (password !== confirmPassword) {
      setMsg({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      if (error) throw error;
      setMsg({ type: 'success', text: 'Senha atualizada com sucesso!' });
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex items-center gap-4 shadow-sm pb-4 md:shadow-none md:pb-0">
        <LogoImage size={50} className="drop-shadow-md" />
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gerenciamento de Conta</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Meu Perfil</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Informações Básicas */}
        <div className="glass-card p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <UserIcon size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Dados Pessoais</h2>
          </div>

          {msg && (
            <div className={`p-4 rounded-xl text-xs font-bold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
              {msg.text}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400">E-MAIL (SOMENTE LEITURA)</label>
              <input type="text" readOnly value={user.email} className="w-full p-3 bg-slate-50 border rounded-xl text-slate-400 cursor-not-allowed" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400">NOME DE EXIBIÇÃO</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)} 
                className="w-full p-3 bg-white border rounded-xl focus:border-indigo-500 outline-none transition-all" 
                placeholder="Como você quer ser chamado" 
              />
            </div>
            <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all">
              Atualizar Nome
            </button>
          </form>
        </div>

        {/* Alterar Senha */}
        <div className="glass-card p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Lock size={20} />
            </div>
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Segurança</h2>
          </div>

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400">NOVA SENHA</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full p-3 bg-white border rounded-xl focus:border-indigo-500 outline-none transition-all" 
                placeholder="Mínimo 6 caracteres" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400">CONFIRMAR NOVA SENHA</label>
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                className="w-full p-3 bg-white border rounded-xl focus:border-indigo-500 outline-none transition-all" 
                placeholder="Repita a senha" 
              />
            </div>
            <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all">
              Alterar Senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}



function FrequencyList({ title, items, stats }: any) {
  return (
    <div className="space-y-5">
      <h3 className="text-[11px] font-black text-slate-300 uppercase tracking-[0.2em]">{title}</h3>
      <div className="space-y-4">
        {items.map((s: any) => {
          const count = stats[s.id] || 0;
          return (
            <div key={s.id} className="group flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:bg-white group-hover:shadow-sm border border-transparent group-hover:border-slate-100 transition-all">
                  {s.name[0]}
                </div>
                <span className="text-sm font-bold text-slate-700">{s.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full bg-indigo-500 rounded-full`} style={{ width: `${Math.min(count * 25, 100)}%` }} />
                </div>
                <span className="text-xs font-black font-mono text-slate-900 w-6">{count}x</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCardV2({ label, value, icon, color, alert }: any) {
  const themes: any = {
    indigo: 'from-indigo-600/10 to-indigo-600/0 text-indigo-700',
    blue: 'from-blue-600/10 to-blue-600/0 text-blue-700',
    rose: 'from-rose-600/10 to-rose-600/0 text-rose-700',
  };

  return (
    <div className={`glass-card p-6 overflow-hidden relative group hover:border-${color}-200/50 hover:-translate-y-1 cursor-default`}>
       <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${themes[color]} rounded-bl-full z-0 opacity-40 group-hover:opacity-60 transition-opacity`} />
       <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:border-indigo-100 group-hover:shadow-indigo-50 transition-all">
              {icon}
            </div>
            {alert && <div className="w-3 h-3 bg-rose-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.5)]" />}
          </div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
          <p className="text-4xl font-display font-black text-slate-900 mt-1">{value}</p>
       </div>
    </div>
  );
}

function MembersView({ servers, onAdd, onUpdate, onDelete, stats, isAdmin }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ServerRole>('coroinha');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        // Remove header if it exists
        const dataLines = lines[0].toLowerCase().includes('nome') ? lines.slice(1) : lines;
        
        for (const line of dataLines) {
          const [importName, importType, importEmail, importWhatsapp] = line.split(',').map(s => s.trim());
          if (importName) {
            await onAdd({ 
              name: importName, 
              type: (importType?.toLowerCase().includes('acolito') ? 'acolito' : 'coroinha'), 
              email: importEmail || '', 
              whatsapp: importWhatsapp || '' 
            });
          }
        }
        alert('Importação concluída com sucesso!');
      } catch (err) {
        alert('Erro ao processar arquivo. Certifique-se de que é um CSV válido (Nome, Tipo, E-mail, WhatsApp).');
      } finally {
        setIsImporting(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingId) {
        await onUpdate(editingId, { name, type, email, whatsapp, birthDate });
        setEditingId(null);
      } else {
        await onAdd({ name, type, email, whatsapp, birthDate });
      }

      setName('');
      setEmail('');
      setWhatsapp('');
      setBirthDate('');
      setType('coroinha');
    } catch (err) {
      // Error handled by onAdd/onUpdate
    }
  };

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setName(s.name);
    setType(s.type);
    setEmail(s.email || '');
    setWhatsapp(s.whatsapp || '');
    setBirthDate(s.birthDate || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão de Pessoas</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Equipe Litúrgica</h1>
          </div>
        </div>
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
           <button onClick={() => setType('acolito')} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${type === 'acolito' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-800'}`}>Acólitos</button>
           <button onClick={() => setType('coroinha')} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${type === 'coroinha' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-800'}`}>Coroinhas</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {isAdmin && (
          <div className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <UserPlus size={20} />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                    {editingId ? 'Editar Membro' : 'Cadastro Manual'}
                  </h2>
                </div>
                
                {!editingId && (
                  <label className="cursor-pointer p-2 hover:bg-slate-50 rounded-lg transition-colors border border-dashed border-slate-200 group/import">
                    <input type="file" accept=".csv" onChange={handleImportCSV} className="hidden" />
                    <Download size={16} className="text-slate-400 group-hover/import:text-indigo-600" title="Importar CSV" />
                  </label>
                )}
              </div>

              {isImporting && (
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest animate-pulse flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Processando Importação...
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nome Completo</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Gabriel Martins"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">WhatsApp</label>
                    <input 
                      type="text" 
                      value={whatsapp}
                      onChange={e => setWhatsapp(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nascimento</label>
                    <input 
                      type="date" 
                      value={birthDate}
                      onChange={e => setBirthDate(e.target.value)}
                      className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">E-mail</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="exemplo@igreja.com"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Função</label>
                  <div className="grid grid-cols-2 gap-3">
                    <RoleSelector active={type === 'acolito'} onClick={() => setType('acolito')} label="Acólito" />
                    <RoleSelector active={type === 'coroinha'} onClick={() => setType('coroinha')} label="Coroinha" />
                  </div>
                </div>

                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                  <Plus size={18} /> {editingId ? 'Atualizar Membro' : 'Salvar Membro'}
                </button>
                {editingId && (
                  <button 
                    type="button" 
                    onClick={() => { setEditingId(null); setName(''); setEmail(''); setWhatsapp(''); setBirthDate(''); setType('coroinha'); }}
                    className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>

          {servers.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-center px-10">
              <Users size={64} className="text-slate-100 mb-6" />
              <h3 className="text-xl font-bold text-slate-800">Nenhum membro ativo</h3>
              <p className="text-sm text-slate-400 mt-2 max-w-xs">Comece cadastrando os primeiros coroinhas e acólitos no painel ao lado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {servers.map((s: any) => (
                <motion.div layout key={s.id} className="glass-card glass-card-hover p-5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg ${s.type === 'acolito' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                      {s.name ? s.name[0] : '?'}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors uppercase text-sm leading-none">{s.name}</h4>
                      <div className="flex flex-wrap items-center gap-2">
                         <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${s.type === 'acolito' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                           {s.type}
                         </span>
                         <span className="text-[10px] font-mono font-bold text-slate-400">{stats[s.id] || 0} Missas</span>
                      </div>
                      {(s.whatsapp || s.email || s.birthDate) && (
                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-medium">
                          {s.whatsapp && <span className="flex items-center gap-1 opacity-70"><Phone size={10} /> {s.whatsapp}</span>}
                          {s.email && <span className="flex items-center gap-1 opacity-70"><Mail size={10} /> {s.email}</span>}
                          {s.birthDate && <span className="flex items-center gap-1 opacity-70 text-[9px] font-bold">Nasc: {new Date(s.birthDate).toLocaleDateString('pt-BR')}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => startEdit(s)} className="p-2 text-slate-200 hover:text-indigo-600 transition-colors">
                        <ChevronRight size={18} />
                      </button>
                      <button onClick={() => onDelete(s.id)} className="p-2 text-slate-200 hover:text-rose-500 transition-colors group/trash">
                        <Trash2 size={18} className="group-hover/trash:scale-110 transition-transform" />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleSelector({ active, onClick, label }: any) {
  return (
    <button 
      type="button" 
      onClick={onClick}
      className={`p-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
        active ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-[1.02]' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

function CommunitiesView({ communities, onAdd, onUpdate, onDelete, isAdmin }: any) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const OFFICIAL_COMMUNITIES = [
    'Matriz Nossa Senhora da Abadia',
    'Capela São Sebastião (Bolicho Seco)',
    'Capela São Pedro (São Pedro)',
    'Capela São Paulo Apóstolo (Eldorado/Sede)',
    'Capela São Leopoldo Mandic (Capão Bonito I)',
    'Capela São João Batista (Flórida)',
    'Capela São José (Capão Bonito II)',
    'Capela São João Batista (Eldorado 800)',
    'Capela São Francisco de Assis (Quebra Coco)',
    'Capela Santo Expedito (Estrela)',
    'Capela Santo Antonio (Capão Bonito II)'
  ];

  const handleAddOfficial = (name: string) => {
    if (!communities.some((c: any) => c.name.toLowerCase() === name.toLowerCase())) {
      onAdd(name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    if (editingId) {
      onUpdate(editingId, name);
      setEditingId(null);
    } else {
      onAdd(name);
    }
    setName('');
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão Territorial</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Comunidades</h1>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {isAdmin && (
          <div className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <MapPin size={20} />
                </div>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                  {editingId ? 'Editar Local' : 'Novo Local'}
                </h2>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nome da Comunidade</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Ex: Capela Santa Luzia"
                    className="w-full p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                  />
                </div>

                <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                  <Plus size={18} /> {editingId ? 'Atualizar Local' : 'Salvar Local'}
                </button>
                {editingId && (
                  <button 
                    type="button" 
                    onClick={() => { setEditingId(null); setName(''); }}
                    className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        <div className={isAdmin ? "lg:col-span-2" : "lg:col-span-3"}>
          {communities.length === 0 ? (
            <div className="flex flex-col gap-6">
              <div className="h-48 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-center px-10">
                <MapPin size={48} className="text-slate-100 mb-4" />
                <p className="font-bold text-slate-400">Nenhuma comunidade cadastrada.</p>
              </div>
              
              {isAdmin && (
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Importar Comunidades Oficiais</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {OFFICIAL_COMMUNITIES.map(comm => (
                      <button 
                        key={comm} 
                        onClick={() => handleAddOfficial(comm)}
                        className="p-3 text-left bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-100 hover:text-indigo-600 transition-all font-bold text-[10px] uppercase tracking-tight flex items-center justify-between group"
                      >
                        {comm}
                        <Plus size={14} className="opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {communities.map((c: any) => (
                  <div key={c.id} className="glass-card p-5 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                        <MapPin size={18} />
                      </div>
                      <h4 className="font-bold text-slate-800 uppercase text-sm tracking-tight">{c.name}</h4>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 transform opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                          <ChevronRight size={18} />
                        </button>
                        <button onClick={() => onDelete(c.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {isAdmin && communities.length < OFFICIAL_COMMUNITIES.length && (
                <div className="pt-8 border-t border-slate-100">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Sugestões (Ainda não cadastradas)</h3>
                  <div className="flex flex-wrap gap-2">
                    {OFFICIAL_COMMUNITIES.filter(name => !communities.some((c: any) => c.name.toLowerCase() === name.toLowerCase())).map(comm => (
                      <button 
                        key={comm} 
                        onClick={() => handleAddOfficial(comm)}
                        className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors text-[9px] font-bold uppercase tracking-tight"
                      >
                        + {comm}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MassesView({ masses, onAdd, onUpdate, onDelete, communities, isAdmin }: any) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (communities.length > 0 && !location) {
      setLocation(communities[0].name);
    }
  }, [communities, location]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time || !location) return;
    
    if (editingId) {
      onUpdate(editingId, { title, date, time, location });
      setEditingId(null);
    } else {
      onAdd(title, date, time, location);
    }
    
    setTitle('');
    setDate('');
    setTime('');
  };

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setTitle(m.title);
    setDate(m.date);
    setTime(m.time);
    setLocation(m.location);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setDate('');
    setTime('');
    if (communities.length > 0) setLocation(communities[0].name);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Agenda Litúrgica</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Celebrações</h1>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {isAdmin && (
          <div className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-6">
               <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 overflow-hidden">
                    <LogoImage size={32} />
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                    {editingId ? 'Editar Evento' : 'Novo Evento'}
                  </h2>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Título da Missa</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Missa de Solenidade" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:border-indigo-500 font-bold" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Data</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold" />
                     </div>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Horário</label>
                        <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold" />
                     </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Localização</label>
                    {communities.length > 0 ? (
                      <select 
                        value={location} 
                        onChange={e => setLocation(e.target.value)}
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-500 appearance-none"
                      >
                        {communities.map((c: any) => (
                          <option key={c.id} value={c.name}>{c.name}</option>
                        ))}
                        <option value="Outro">Outro...</option>
                      </select>
                    ) : (
                      <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Ex: Matriz Paroquial" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-500" />
                    )}
                    {location === 'Outro' && (
                      <input type="text" onChange={e => setLocation(e.target.value)} placeholder="Digite o local" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:border-indigo-500 mt-2" />
                    )}
                  </div>
                  <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl">
                     {editingId ? 'Atualizar Missa' : 'Agendar Missa'}
                  </button>
                  {editingId && (
                    <button type="button" onClick={cancelEdit} className="w-full py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
                      Cancelar Edição
                    </button>
                  )}
                </div>
            </form>
          </div>
        )}

        <div className={isAdmin ? "lg:col-span-2 space-y-4" : "lg:col-span-3 space-y-4"}>
           {masses.length === 0 ? (
             <div className="h-64 flex flex-col items-center justify-center glass-card border-dashed text-center px-10">
                <Calendar size={48} className="text-slate-100 mb-4" />
                <p className="font-bold text-slate-400 text-sm">Nenhuma celebração agendada para o futuro.</p>
             </div>
           ) : (
             masses.map((m: any) => (
                <div key={m.id} className="glass-card glass-card-hover p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-slate-800 rounded-2xl flex flex-col items-center justify-center text-white border-2 border-slate-700 shadow-lg shrink-0">
                         <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1 leading-none">{m.date.split('-')[1]}</span>
                         <span className="text-2xl font-display font-black leading-none">{m.date.split('-')[2]}</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight leading-none mb-1 uppercase text-sm">{m.title}</h3>
                        <div className="flex flex-wrap items-center gap-4 text-slate-400 text-[11px] font-bold uppercase tracking-widest">
                           <div className="flex items-center gap-1.5"><Clock size={12} className="text-indigo-400" /> {m.time}</div>
                           <div className="flex items-center gap-1.5"><MapPin size={12} className="text-indigo-400" /> {m.location}</div>
                        </div>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mr-4 hidden xl:block">Participantes: {m.assignments.acolitos.length + m.assignments.coroinhas.length}</div>
                      {isAdmin && (
                        <>
                          <button onClick={() => startEdit(m)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                            <ChevronRight size={20} />
                          </button>
                          <button onClick={() => onDelete(m.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                            <Trash2 size={20} />
                          </button>
                        </>
                      )}
                      {!isAdmin && (
                        <div className="px-4 py-2 bg-slate-50 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest leading-none">Apenas Leitura</div>
                      )}
                   </div>
                </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function ScheduleView({ masses, servers, onToggle, stats, autoSchedule, clearSchedule, isAdmin }: any) {
  const [selectedMassId, setSelectedMassId] = useState<string | null>(masses[0]?.id || null);
  const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);
  const [autoConfigs, setAutoConfigs] = useState<Record<string, { acolitos: number, coroinhas: number }>>({});
  const [selectedMassesForAuto, setSelectedMassesForAuto] = useState<Set<string>>(new Set());

  // Initialize configs if empty and select all by default when opening
  useEffect(() => {
    if (isAutoModalOpen) {
      if (Object.keys(autoConfigs).length === 0) {
        const initialConfigs: Record<string, { acolitos: number, coroinhas: number }> = {};
        masses.forEach((m: any) => {
          const isMatriz = m.location.toLowerCase().includes('matriz');
          const dateObj = new Date(m.date + 'T12:00:00');
          const isSunday = dateObj.getDay() === 0;
          initialConfigs[m.id] = { 
            acolitos: isMatriz ? 3 : (isSunday ? 2 : 1), 
            coroinhas: isMatriz ? 4 : 2 
          };
        });
        setAutoConfigs(initialConfigs);
      }
      if (selectedMassesForAuto.size === 0) {
        setSelectedMassesForAuto(new Set(masses.map((m: any) => m.id)));
      }
    }
  }, [isAutoModalOpen, masses]);

  const toggleMassSelection = (id: string) => {
    const newSet = new Set(selectedMassesForAuto);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedMassesForAuto(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedMassesForAuto.size === masses.length) {
      setSelectedMassesForAuto(new Set());
    } else {
      setSelectedMassesForAuto(new Set(masses.map((m: any) => m.id)));
    }
  };

  const selectedMass = masses.find((m: any) => m.id === selectedMassId);
  const selectedMassAssignments = useMemo(() => {
    if (!selectedMass) return { acolitos: [], coroinhas: [] };
    return {
      acolitos: selectedMass.assignments.acolitos.map((id: string) => servers.find((s: any) => s.id === id)?.name).filter(Boolean),
      coroinhas: selectedMass.assignments.coroinhas.map((id: string) => servers.find((s: any) => s.id === id)?.name).filter(Boolean)
    };
  }, [selectedMass, servers]);

  const shareWhatsApp = () => {
    if (!selectedMass) return;
    const dateArr = selectedMass.date.split('-');
    const formattedDate = `${dateArr[2]}/${dateArr[1]}/${dateArr[0]}`;
    
    let text = `*ESCALA DE ALTAR - ABADIA SIDROLÂNDIA*\n\n`;
    text += `*CELEBRAÇÃO:* ${selectedMass.title.toUpperCase()}\n`;
    text += `*DATA:* ${formattedDate}\n`;
    text += `*HORÁRIO:* ${selectedMass.time}\n`;
    text += `*LOCAL:* ${selectedMass.location}\n\n`;
    
    if (selectedMassAssignments.acolitos.length > 0) {
      text += `*ACÓLITOS:*\n`;
      selectedMassAssignments.acolitos.forEach((name: string) => text += `• ${name}\n`);
      text += `\n`;
    }
    
    if (selectedMassAssignments.coroinhas.length > 0) {
      text += `*COROINHAS:*\n`;
      selectedMassAssignments.coroinhas.forEach((name: string) => text += `• ${name}\n`);
    }
    
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8 flex-1 flex flex-col h-full overflow-hidden">
      <header className="flex h-fit flex-col md:flex-row md:items-end justify-between gap-6 shrink-0">
        <div className="flex items-center gap-4">
          <LogoImage size={50} className="drop-shadow-md" />
          <div className="space-y-1">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Operação de Altar</p>
            <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Montagem de Escala</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button 
                onClick={clearSchedule}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all"
              >
                 Limpar Tudo
              </button>
              <button 
                onClick={() => setIsAutoModalOpen(true)}
                className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all"
              >
                 <Layers size={16} /> Montagem Inteligente
              </button>
            </>
          )}
          <button 
            onClick={shareWhatsApp}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all font-bold"
          >
             <Share2 size={16} /> WhatsApp
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all font-bold"
          >
             <Download size={16} /> Exportar
          </button>
        </div>
      </header>

      {masses.length === 0 ? (
         <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <ClipboardList size={80} className="text-slate-100 mb-6" />
            <h3 className="text-xl font-bold text-slate-800">Primeiro, agende as missas</h3>
            <p className="text-sm text-slate-400 max-w-xs text-center mt-2 px-6">Para montar as escalas, você precisa ter missas cadastradas no sistema.</p>
         </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-6">
           {/* Horizonal Mass Selector */}
           <div className="relative group shrink-0">
             <div 
               id="mass-selector"
               className="flex gap-4 overflow-x-auto pb-6 -mx-4 px-4 no-scrollbar scroll-smooth snap-x snap-mandatory"
             >
               {masses.map((m: any) => (
                 <button
                   key={m.id}
                   onClick={() => setSelectedMassId(m.id)}
                   className={`group flex-shrink-0 w-[200px] p-4 rounded-3xl border transition-all text-left snap-start ${
                     selectedMassId === m.id ? 'bg-white border-indigo-600 shadow-xl ring-2 ring-indigo-50' : 'bg-white/50 hover:bg-white border-slate-100'
                   }`}
                 >
                   <div className="flex items-center justify-between mb-2">
                     <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">{m.date}</p>
                     <p className="text-[9px] font-black text-slate-300 uppercase">{m.time}</p>
                   </div>
                   <h4 className="text-sm font-bold text-slate-900 leading-tight mb-3 line-clamp-2 uppercase tracking-tight h-10">{m.title}</h4>
                   <div className="flex items-center justify-between">
                     <div className="flex -space-x-1.5">
                        {Array.from({ length: Math.min(m.assignments.acolitos.length + m.assignments.coroinhas.length, 3) }).map((_, i) => (
                          <div key={i} className="w-6 h-6 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[9px] font-black text-indigo-600">
                            {i + 1}
                          </div>
                        ))}
                        {(m.assignments.acolitos.length + m.assignments.coroinhas.length) > 3 && (
                          <div className="w-6 h-6 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center text-[8px] font-black text-white">
                            +{ (m.assignments.acolitos.length + m.assignments.coroinhas.length) - 3 }
                          </div>
                        )}
                     </div>
                     {m.assignments.acolitos.length + m.assignments.coroinhas.length === 0 ? (
                       <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest italic">Sem escala</span>
                     ) : (
                       <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">{m.assignments.acolitos.length + m.assignments.coroinhas.length} Membros</span>
                     )}
                   </div>
                 </button>
               ))}
             </div>

             {/* Scroll Buttons */}
             <div className="absolute -left-4 top-1/2 -translate-y-1/2 transition-opacity pointer-events-none hidden md:flex z-10">
               <button 
                 onClick={() => document.getElementById('mass-selector')?.scrollBy({ left: -250, behavior: 'smooth' })}
                 className="p-2.5 bg-white/95 backdrop-blur shadow-xl border border-slate-100 rounded-full text-slate-400 hover:text-indigo-600 active:scale-90 transition-all pointer-events-auto"
               >
                 <ChevronRight size={18} className="rotate-180" />
               </button>
             </div>
             <div className="absolute -right-4 top-1/2 -translate-y-1/2 transition-opacity pointer-events-none hidden md:flex z-10">
               <button 
                 onClick={() => document.getElementById('mass-selector')?.scrollBy({ left: 250, behavior: 'smooth' })}
                 className="p-2.5 bg-white/95 backdrop-blur shadow-xl border border-slate-100 rounded-full text-slate-400 hover:text-indigo-600 active:scale-90 transition-all pointer-events-auto"
               >
                 <ChevronRight size={18} />
               </button>
             </div>
           </div>

           {selectedMass && (
             <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-4 gap-8 overflow-hidden">
                {/* Available List (Sidebar inside content) */}
                <aside className="xl:col-span-1 glass-card flex flex-col overflow-hidden">
                   <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                      <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Disponíveis</h2>
                      <span className="text-[10px] font-black bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">{servers.length} TOTAL</span>
                   </div>
                   <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scroll">
                      {/* Priority Alert Box */}
                      {servers.some((s:any) => stats[s.id] === 0) && (
                        <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-center gap-3">
                           <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                           <span className="text-[10px] font-black text-rose-700 uppercase leading-none">Prioridade: 0 escalas</span>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        {servers.sort((a:any, b:any) => (stats[a.id] || 0) - (stats[b.id] || 0)).map((s: any) => {
                          const count = stats[s.id] || 0;
                          const isAssigned = selectedMass.assignments.acolitos.includes(s.id) || selectedMass.assignments.coroinhas.includes(s.id);
                          
                          // Check if a sibling is assigned
                          const assignedSibling = s.familyId && !isAssigned && servers.find((serv: any) => 
                            (selectedMass.assignments.acolitos.includes(serv.id) || selectedMass.assignments.coroinhas.includes(serv.id)) && 
                            serv.familyId === s.familyId
                          );

                          return (
                            <button
                              key={s.id}
                              disabled={!isAdmin}
                              onClick={() => onToggle(selectedMass.id, s.id, s.type)}
                              className={`w-full group flex items-center justify-between p-3 rounded-xl border transition-all text-left shadow-sm ${
                                isAssigned 
                                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                                  : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 text-slate-700'
                              } ${!isAdmin ? 'cursor-default' : ''}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] uppercase shadow-sm ${
                                  isAssigned ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                                }`}>
                                  {s.name[0]}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold leading-none">{s.name}</p>
                                    {assignedSibling && <AlertCircle size={10} className="text-rose-500" title={`Familiar (${assignedSibling.name}) já escalado`} />}
                                  </div>
                                  <p className={`text-[8px] font-black uppercase tracking-widest leading-none mt-1 ${isAssigned ? 'text-indigo-200' : 'text-slate-300'}`}>{s.type}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                 {count === 0 && !isAssigned && <span className="text-[8px] font-black text-rose-500 uppercase italic">Nunca</span>}
                                 <span className={`text-[10px] font-mono font-bold ${isAssigned ? 'text-white/60' : 'text-slate-300'}`}>{count}x</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                   </div>
                </aside>

                {/* Main Schedule Board */}
                <section className="xl:col-span-3 flex flex-col gap-6 overflow-hidden">
                   <div className="glass-card flex-1 flex flex-col overflow-hidden bg-white">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 shrink-0">
                         <div className="flex justify-between items-start">
                            <div>
                               <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.25em] mb-2">{selectedMass.date} • {selectedMass.time}</p>
                               <h3 className="text-2xl font-display font-black text-slate-900 tracking-tight leading-none uppercase">{selectedMass.title}</h3>
                               <p className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-60">
                                 <MapPin size={12} className="text-indigo-400" /> {selectedMass.location}
                               </p>
                            </div>
                            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-xl shadow-indigo-100 overflow-hidden">
                               <LogoImage size={40} />
                            </div>
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 custom-scroll">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            {/* Acolitos Section */}
                            <div className="space-y-6">
                               <div className="flex justify-between items-center pb-2 border-b-2 border-slate-50">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Acólitos ({selectedMass.assignments.acolitos.length})</h4>
                                  <Plus size={14} className="text-slate-300" />
                               </div>
                               <div className="space-y-3">
                                  {selectedMass.assignments.acolitos.length === 0 ? (
                                    <div className="p-10 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center opacity-40">
                                       <Users size={32} className="text-slate-100 mb-3" />
                                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nenhum Escalado</span>
                                    </div>
                                  ) : (
                                    selectedMass.assignments.acolitos.map((id: string) => {
                                      const s = servers.find((serv: any) => serv.id === id);
                                      return (
                                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key={id} className="group relative flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-white hover:shadow-xl hover:shadow-indigo-50/50 transition-all">
                                           <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-black shadow-sm group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                             {s?.name[0]}
                                           </div>
                                           <div className="flex-1 min-w-0">
                                              <p className="text-sm font-bold text-slate-900 truncate">{s?.name}</p>
                                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Acólito Escalado</p>
                                           </div>
                                           <button onClick={() => onToggle(selectedMass.id, id, 'acolito')} className="p-2 text-slate-200 hover:text-rose-500 transition-colors">
                                              <X size={18} />
                                           </button>
                                        </motion.div>
                                      );
                                    })
                                  )}
                               </div>
                            </div>

                            {/* Coroinhas Section */}
                            <div className="space-y-6">
                               <div className="flex justify-between items-center pb-2 border-b-2 border-slate-50">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Coroinhas ({selectedMass.assignments.coroinhas.length})</h4>
                                  <Plus size={14} className="text-slate-300" />
                               </div>
                               <div className="grid gap-3">
                                  {selectedMass.assignments.coroinhas.length === 0 ? (
                                    <div className="p-10 rounded-2xl border-2 border-dashed border-slate-100 flex flex-col items-center justify-center opacity-40">
                                       <Users size={32} className="text-slate-100 mb-3" />
                                       <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nenhum Escalado</span>
                                    </div>
                                  ) : (
                                    selectedMass.assignments.coroinhas.map((id: string) => {
                                      const s = servers.find((serv: any) => serv.id === id);
                                      return (
                                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} key={id} className="group flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-indigo-200 hover:bg-white hover:shadow-xl hover:shadow-indigo-50/50 transition-all">
                                           <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all">
                                             {s?.name[0]}
                                           </div>
                                           <div className="flex-1 min-w-0">
                                              <p className="text-sm font-bold text-slate-900 truncate">{s?.name}</p>
                                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Coroinha Escalado</p>
                                           </div>
                                           <button onClick={() => onToggle(selectedMass.id, id, 'coroinha')} className="p-2 text-slate-200 hover:text-rose-500 transition-colors">
                                              <X size={18} />
                                           </button>
                                        </motion.div>
                                      );
                                    })
                                  )}
                               </div>
                            </div>
                         </div>
                      </div>

                      {/* Distribution Footer */}
                      <div className="h-16 bg-slate-900 rounded-b-xl flex items-center justify-between px-8 text-white shrink-0">
                         <div className="flex items-center gap-6">
                            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">RESUMO DA ESCALA</span>
                            <div className="flex gap-1">
                               {Array.from({ length: selectedMass.assignments.acolitos.length + selectedMass.assignments.coroinhas.length }).map((_, i) => (
                                 <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]" />
                               ))}
                            </div>
                         </div>
                         <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest">
                            <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Balanço Estável</span>
                            <span className="text-slate-500">{selectedMass.assignments.acolitos.length + selectedMass.assignments.coroinhas.length} Total</span>
                         </div>
                      </div>
                   </div>
                </section>
             </div>
           )}
        </div>
      )}

      {/* Smart Assembly Modal */}
      <AnimatePresence>
        {isAutoModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setIsAutoModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-xl font-display font-black text-slate-900 leading-none">Montagem Inteligente</h2>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-2">{masses.length} Missas Detectadas</p>
                </div>
                <button onClick={() => setIsAutoModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-4 thin-scrollbar space-y-4">
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase text-center sm:text-left leading-relaxed max-w-sm">
                    Configure a quantidade de servidores para cada missa abaixo. 
                    O sistema tentará preencher as vagas automaticamente.
                  </p>
                  <button 
                    onClick={toggleSelectAll}
                    className="px-4 py-2 bg-white border border-indigo-200 rounded-xl text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                  >
                    {selectedMassesForAuto.size === masses.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                  </button>
                </div>

                <div className="space-y-3">
                   {masses.map((m: any) => {
                     const isSelected = selectedMassesForAuto.has(m.id);
                     const config = autoConfigs[m.id] || { acolitos: 1, coroinhas: 2 };
                     return (
                       <div 
                         key={m.id} 
                         className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                           isSelected ? 'bg-white border-indigo-100 shadow-md ring-1 ring-indigo-50' : 'bg-slate-50 opacity-60 grayscale-[0.5] border-slate-100'
                         }`}
                       >
                         <div className="flex items-center gap-4">
                           <button 
                             onClick={() => toggleMassSelection(m.id)}
                             className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all border ${
                               isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-transparent'
                             }`}
                           >
                             <Check size={14} strokeWidth={4} />
                           </button>
                           <div className="space-y-1">
                             <p className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">{m.date} • {m.time}</p>
                             <h4 className="text-xs font-bold text-slate-700 uppercase leading-tight truncate max-w-[200px]">{m.title}</h4>
                           </div>
                         </div>
                         
                         <div className={`flex items-center gap-6 transition-all ${isSelected ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                           <div className="space-y-2">
                             <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block text-center">Acólitos</label>
                             <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200">
                               <button 
                                 onClick={() => setAutoConfigs(prev => ({ ...prev, [m.id]: { ...config, acolitos: Math.max(0, config.acolitos - 1) } }))}
                                 className="w-6 h-6 rounded bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                               >-</button>
                               <span className="w-4 text-center text-xs font-black text-slate-800">{config.acolitos}</span>
                               <button 
                                 onClick={() => setAutoConfigs(prev => ({ ...prev, [m.id]: { ...config, acolitos: config.acolitos + 1 } }))}
                                 className="w-6 h-6 rounded bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                               >+</button>
                             </div>
                           </div>
                           
                           <div className="space-y-2">
                             <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block text-center">Coroinhas</label>
                             <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-slate-200">
                               <button 
                                 onClick={() => setAutoConfigs(prev => ({ ...prev, [m.id]: { ...config, coroinhas: Math.max(0, config.coroinhas - 1) } }))}
                                 className="w-6 h-6 rounded bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                               >-</button>
                               <span className="w-4 text-center text-xs font-black text-slate-800">{config.coroinhas}</span>
                               <button 
                                 onClick={() => setAutoConfigs(prev => ({ ...prev, [m.id]: { ...config, coroinhas: config.coroinhas + 1 } }))}
                                 className="w-6 h-6 rounded bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                               >+</button>
                             </div>
                           </div>
                         </div>
                       </div>
                     );
                   })}
                 </div>
              </div>

              <div className="p-8 border-t border-slate-50 bg-slate-50/50 shrink-0">
                <button 
                  disabled={selectedMassesForAuto.size === 0}
                  onClick={() => {
                    const filteredConfigs: Record<string, { acolitos: number, coroinhas: number }> = {};
                    selectedMassesForAuto.forEach(id => {
                      filteredConfigs[id] = autoConfigs[id];
                    });
                    autoSchedule(filteredConfigs);
                    setIsAutoModalOpen(false);
                  }}
                  className="w-full py-4 bg-indigo-600 disabled:bg-slate-300 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all flex items-center justify-center gap-3"
                >
                  <Layers size={18} /> Iniciar Montagem ({selectedMassesForAuto.size})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
