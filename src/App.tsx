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
  LogOut,
  LogIn,
  Loader2,
  Download,
  MoreVertical,
  Layers,
  Share2,
  Phone,
  Mail,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase, db as sdb, checkSupabaseConnection } from './lib/supabase';

import { Server, Mass, View, ServerRole, Community } from './types';
import { User } from '@supabase/supabase-js';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleSupabaseError(error: any, operationType: OperationType, path: string | null) {
  console.error(`Supabase ${operationType} Error on ${path}:`, error);
  
  let msg = `Erro no banco de dados (${operationType}): ${error.message || 'Erro desconhecido'}`;
  
  if (error.code === 'PGRST204' || error.code === '42P01') {
    msg = `⚠️ Erro Crítico: A tabela '${path}' não existe no Supabase. \n\nVocê precisa executar o comando SQL no painel do Supabase para criar as tabelas.`;
  } else if (error.code === '42501') {
    msg = `⚠️ Erro de Permissão (RLS): Você não tem permissão para realizar esta ação na tabela '${path}'.`;
  } else if (error.code === 'PGRST301' || error.status === 401 || error.status === 403) {
    msg = `⚠️ Erro de Autenticação: Sua chave do Supabase (ANON KEY) é inválida ou expirou. \n\nVerifique se você não colou uma chave do CLERK (que começa com sb_publishable) por engano.`;
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

-- 1. LIMPAR TABELAS ANTIGAS (Garante que o novo formato seja aplicado)
DROP TABLE IF EXISTS masses;
DROP TABLE IF EXISTS servers;
DROP TABLE IF EXISTS communities;

-- 2. CRIAR TABELAS PARA FUNCIONAMENTO DO SISTEMA
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('acolito', 'coroinha')),
  active BOOLEAN DEFAULT TRUE,
  email TEXT,
  whatsapp TEXT,
  birth_date DATE,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE masses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  location TEXT NOT NULL,
  assignments JSONB DEFAULT '{"acolitos": [], "coroinhas": []}'::JSONB,
  owner_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SEGURANÇA (RLS)
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE masses ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE ACESSO
DROP POLICY IF EXISTS "Acesso Total Servidores" ON servers;
CREATE POLICY "Acesso Total Servidores" ON servers FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Comunidades" ON communities;
CREATE POLICY "Acesso Total Comunidades" ON communities FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso Total Missas" ON masses;
CREATE POLICY "Acesso Total Missas" ON masses FOR ALL USING (true) WITH CHECK (true);

-- 5. GERENCIAMENTO DE USUÁRIOS (EXTRA)
-- O Supabase Auth já gerencia usuários, mas precisamos de uma tabela para listar os 'autorizados' se quisermos gerenciar via UI
CREATE TABLE IF NOT EXISTS admin_users (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserir e-mails iniciais
INSERT INTO admin_users (email) VALUES 
('diogoortega@gmail.com'),
('rodrigo--gomes@hotmail.com'),
('rodrigogomessdr@gmail.com')
ON CONFLICT DO NOTHING;

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins podem ver admins" ON admin_users FOR SELECT USING (true);
CREATE POLICY "Admins podem adicionar admins" ON admin_users FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins podem remover admins" ON admin_users FOR DELETE USING (true);
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
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>([]);

  // Connection check
  useEffect(() => {
    // Check if the key looks like a Clerk key
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON || '';
    if (key.startsWith('sb_publishable_') || key.startsWith('pk_')) {
      setIsClerkKey(true);
    }

    checkSupabaseConnection().then((res) => {
      setConnStatus(res);
      if (!res.success && (res.message.includes('não encontrada') || res.message.includes('INVÁLIDA'))) {
        setShowSqlSetup(true);
      }
    });
  }, []);

  const handleEmailLogin = async (email: string, pass: string) => {
    setAuthError(null);
    
    // Validar e-mail localmente antes de tentar login (opcional, mas bom para UX)
    const normalizedEmail = email.trim().toLowerCase();
    const authorized = AUTHORIZED_EMAILS.map(e => e.trim().toLowerCase());
    
    if (!authorized.includes(normalizedEmail)) {
      console.warn("Bloqueio de Email:", normalizedEmail);
      setAuthError(`O e-mail "${normalizedEmail}" não está na lista de administradores autorizados. Verifique se o e-mail está correto no código ou nas configurações.`);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: pass });
      if (error) {
        if (error.message === 'Email not confirmed') {
          throw new Error('E-mail não confirmado. No Supabase, vá em "Authentication" -> "Users" e exclua seu usuário e crie-o novamente, ou confirme-o clicando nos "3 pontinhos" ao lado do usuário.');
        }
        throw error;
      }
    } catch (error: any) {
      console.error("Erro de Login:", error);
      setAuthError(error.message || 'Erro ao acessar o sistema.');
    }
  };

  const handleEmailRegister = async (email: string, pass: string, name: string) => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({ 
        email, 
        password: pass,
        options: {
          data: { display_name: name }
        }
      });
      if (error) {
        if (error.message === 'Email not confirmed') {
          throw new Error('Conta criada! Mas você precisa confirmar o e-mail ou desativar a confirmação no Supabase (Authentication -> Providers -> Email -> Confirm email).');
        }
        throw error;
      }
    } catch (error: any) {
      console.error("Erro de Cadastro:", error);
      setAuthError(error.message || 'Erro ao criar conta.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      
      // Verificação extra de segurança no carregamento inicial
      const normalizedAuthEmails = AUTHORIZED_EMAILS.map(e => e.trim().toLowerCase());
      if (currentUser && currentUser.email && !normalizedAuthEmails.includes(currentUser.email.trim().toLowerCase())) {
         supabase.auth.signOut();
         setUser(null);
         setAuthError('Usuário não autorizado.');
      } else {
         setUser(currentUser);
      }
      
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      
      // Verificação de segurança em tempo real
      const normalizedAuthEmails = AUTHORIZED_EMAILS.map(e => e.trim().toLowerCase());
      if (currentUser && currentUser.email && !normalizedAuthEmails.includes(currentUser.email.trim().toLowerCase())) {
         supabase.auth.signOut();
         setUser(null);
         setAuthError('Usuário não autorizado.');
      } else {
         setUser(currentUser);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Data Fetching
  const fetchAuthorizedEmails = async () => {
    try {
      const { data, error } = await supabase.from('admin_users').select('email');
      if (error) {
        // Se a tabela não existir ainda, usa a lista local
        console.warn("Tabela admin_users não encontrada, usando lista local.");
        setAuthorizedEmails(AUTHORIZED_EMAILS);
        return;
      }
      setAuthorizedEmails(data.map((d: any) => d.email));
    } catch (err) {
      setAuthorizedEmails(AUTHORIZED_EMAILS);
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
      handleSupabaseError(err, OperationType.UPDATE, `servers/${id}`);
    }
  };

  const removeServer = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este servidor?")) return;
    try {
      const { error } = await sdb.servers.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, `servers/${id}`);
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
    if (!mass) return;

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

  const autoSchedule = async () => {
    if (!user || masses.length === 0 || servers.length === 0) return;
    
    // Sort masses by date and time to process chronologically
    const sortedMasses = [...masses].sort((a, b) => {
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

      // Targets based on rules
      const acolitosTarget = isMatriz ? 3 : (isSunday ? 2 : 1);
      const coroinhasTarget = isMatriz ? 4 : 2;

      let newAcolitos = [...mass.assignments.acolitos];
      let newCoroinhas = [...mass.assignments.coroinhas];

      const tryAssign = (server: Server, currentList: string[]) => {
        if (currentList.includes(server.id)) return false;
        if (peopleAssignedOnDate[mass.date].has(server.id)) return false;

        const n = server.name;
        const loc = mass.location.toLowerCase();
        const t = mass.time;
        
        let isForced = false;

        // --- ACOLITOS RULES ---
        if (server.type === 'acolito') {
          if (n.includes("Andrey Henrique") && !isSunday) return false;
          if (n.includes("Júlia Machado") && dayOfWeek === 4) return false;
          if (n.includes("Gabrielly Matos") && ![0, 6].includes(dayOfWeek)) return false;
          
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
          if (n.includes("Júlia Prates") && !isSunday) return false;
          if (n.includes("Beatriz Barbier") && (!isSunday || weekOfMonth === 3 || t === "07:30" || t === "19:00")) return false;
          if (n.includes("Carolina Pasinatto") && (!isSunday || (!loc.includes('matriz') && !loc.includes('aparecida')))) return false;
          if (n.includes("Ana Sofia")) {
             if (dayOfWeek === 3 && weekOfMonth === 3 && t === "19:30") isForced = true;
             if (dayOfWeek === 0 && weekOfMonth === 1 && loc.includes('matriz') && t === "10:00") isForced = true;
             if (dayOfWeek === 6 && weekOfMonth === 5 && loc.includes('pedro') && t === "19:00") isForced = true;
             if (dayOfWeek === 2 && weekOfMonth === 2 && loc.includes('caacupe') && t === "19:00") isForced = true;
             if (dayOfWeek === 0 && weekOfMonth === 4 && loc.includes('matriz') && t === "10:00") return false;
          }
          
          const count = currentStats[server.id] || 0;
          if (n.includes("Elisa Patron") && count >= 2) return false;
          if (n.includes("Luiza Carraro") && count >= 1 && dayOfWeek === 3) return false;
          if (n.includes("Maria Fernanda Moraes") && count >= 1) return false;
          if (n.includes("Nicole Maria") && count >= 1) return false;
          if (n.includes("Renata Valentina") && count >= 1) return false;
        }

        return { allowed: true, isForced };
      };

      // Fill Acolitos
      if (newAcolitos.length < acolitosTarget) {
        const needed = acolitosTarget - newAcolitos.length;
        const available = servers
          .map(s => ({ s, ...tryAssign(s, newAcolitos) }))
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
          .map(s => ({ s, ...tryAssign(s, newCoroinhas) }))
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
        error={authError}
      />
    );
  }


  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Navigation Bar */}
      <nav className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shadow-sm z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-700 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Church size={22} />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold tracking-tight text-slate-800 uppercase leading-none flex items-center gap-2">
              Abadia Sidrolândia
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
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Gestão de Escalas • MS</p>
          </div>
        </div>

        {/* View Switcher - Desktop */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <NavTab active={view === 'dashboard'} onClick={() => setView('dashboard')} label="Dashboard" />
          <NavTab active={view === 'members'} onClick={() => setView('members')} label="Membros" />
          <NavTab active={view === 'communities'} onClick={() => setView('communities')} label="Comunidades" />
          <NavTab active={view === 'masses'} onClick={() => setView('masses')} label="Missas" />
          <NavTab active={view === 'users_admin'} onClick={() => setView('users_admin')} label="Administradores" />
          <NavTab active={view === 'schedule'} onClick={() => setView('schedule')} label="Montar Escala" />
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
                <span className="font-bold text-slate-800 uppercase tracking-widest text-sm">Menu</span>
                <button onClick={() => setIsSidebarOpen(false)}><X size={24} className="text-slate-400" /></button>
              </div>
              <div className="space-y-2">
                <NavButtonView active={view === 'dashboard'} onClick={() => { setView('dashboard'); setIsSidebarOpen(false); }} icon={<LayoutDashboard size={18} />} label="Dashboard" />
                <NavButtonView active={view === 'members'} onClick={() => { setView('members'); setIsSidebarOpen(false); }} icon={<Users size={18} />} label="Membros" />
                <NavButtonView active={view === 'communities'} onClick={() => { setView('communities'); setIsSidebarOpen(false); }} icon={<MapPin size={18} />} label="Comunidades" />
                <NavButtonView active={view === 'masses'} onClick={() => { setView('masses'); setIsSidebarOpen(false); }} icon={<Church size={18} />} label="Missas" />
                <NavButtonView active={view === 'users_admin'} onClick={() => { setView('users_admin'); setIsSidebarOpen(false); }} icon={<UserPlus size={18} />} label="Usuários" />
                <NavButtonView active={view === 'schedule'} onClick={() => { setView('schedule'); setIsSidebarOpen(false); }} icon={<Calendar size={18} />} label="Montagem" />
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
                clearAllData={clearAllData} 
                isDeleting={isDeleting}
              />
            )}
            {view === 'members' && <MembersView servers={servers} onAdd={addServer} onUpdate={updateServer} onDelete={removeServer} stats={serverStats} />}
            {view === 'communities' && <CommunitiesView communities={communities} onAdd={addCommunity} onUpdate={updateCommunity} onDelete={removeCommunity} />}
            {view === 'users_admin' && (
              <UsersAdminView 
                emails={authorizedEmails} 
                onAdd={(email: string) => {
                  supabase.from('admin_users').insert({ email }).then(() => fetchAuthorizedEmails());
                }} 
                onDelete={(email: string) => {
                  supabase.from('admin_users').delete().eq('email', email).then(() => fetchAuthorizedEmails());
                }} 
                onUpdate={(oldEmail: string, newEmail: string) => {
                  supabase.from('admin_users').update({ email: newEmail }).eq('email', oldEmail).then(() => fetchAuthorizedEmails());
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
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
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
  error 
}: { 
  onEmailLogin: (email: string, pass: string) => void,
  error: string | null
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEmailLogin(email, password);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative overflow-hidden font-sans">
      {/* Decorative Orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />

      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-indigo-700 rounded-[1.5rem] flex items-center justify-center text-white shadow-2xl shadow-indigo-200 mb-6 transform hover:rotate-3 transition-transform cursor-default relative">
              <Church size={40} />
              <div className="absolute -top-2 -right-2 bg-amber-400 w-8 h-8 rounded-full border-4 border-white flex items-center justify-center text-indigo-900 shadow-sm">
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
              <h2 className="text-xl font-bold text-slate-800">Portal do Altar</h2>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Acesso restrito aos administradores autorizados da Abadia.
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
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail Administrativo</label>
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
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
              >
                <LogIn size={18} />
                Entrar no Sistema
              </button>
            </form>

            <div className="text-center pt-2 space-y-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Apenas usuários pré-cadastrados
              </p>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight leading-relaxed max-w-[200px] mx-auto text-center">
                  Segurança Paroquial • MS
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
  clearAllData, 
  isDeleting
}: any) {
  return (
    <div className="space-y-10">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão Global</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Dashboard</h1>
        </div>
          <div className="flex gap-3">
            <button 
              onClick={clearAllData}
              disabled={isDeleting}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-rose-200 text-rose-500 rounded-xl text-sm font-bold hover:bg-rose-50 transition-all disabled:opacity-50"
            >
               {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
               {isDeleting ? 'Excluindo...' : 'Limpar Dados'}
            </button>
            <button onClick={() => setView('schedule')} className="group flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
              <Calendar size={18} className="group-hover:rotate-12 transition-transform" /> Montar Nova Escala
            </button>
          </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCardV2 label="Servidores Ativos" value={servers.length} icon={<Users className="text-indigo-600" />} color="indigo" />
        <StatCardV2 label="Missas Planejadas" value={masses.length} icon={<Church className="text-blue-600" />} color="blue" />
        <StatCardV2 label="Pendências de Equilíbrio" value={unassigned.length} icon={<AlertCircle className="text-rose-600" />} color="rose" alert={unassigned.length > 0} />
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

function UsersAdminView({ emails, onAdd, onDelete, onUpdate }: any) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [tempEditedEmail, setTempEditedEmail] = useState('');

  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    onAdd(newEmail.trim().toLowerCase());
    setNewEmail('');
    setMsg({ type: 'success', text: 'E-mail autorizado com sucesso!' });
  };

  const handleUpdateEmail = (oldEmail: string) => {
    if (!tempEditedEmail.trim() || tempEditedEmail === oldEmail) {
      setEditingEmail(null);
      return;
    }
    onUpdate(oldEmail, tempEditedEmail.trim().toLowerCase());
    setEditingEmail(null);
    setMsg({ type: 'success', text: 'E-mail atualizado com sucesso!' });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!newEmail.trim() || !password.trim()) return;

    try {
      const { error } = await supabase.auth.signUp({
        email: newEmail.trim().toLowerCase(),
        password,
        options: {
          data: { display_name: displayName }
        }
      });

      if (error) throw error;
      
      // Também adiciona à lista de autorizados se não estiver
      onAdd(newEmail.trim().toLowerCase());
      
      setMsg({ type: 'success', text: 'Usuário criado com sucesso! O e-mail deve ser confirmado se a opção estiver ativa no Supabase.' });
      setNewEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Segurança do Sistema</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Administradores</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="glass-card p-8 space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <UserPlus size={20} />
                </div>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Autorizar E-mail</h2>
             </div>
             
             <p className="text-xs text-slate-500">Adicione o e-mail de quem poderá acessar o sistema. O usuário precisará criar uma conta com este mesmo e-mail.</p>

             <form onSubmit={handleAddEmail} className="flex gap-2">
                <input 
                  type="email" 
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  className="flex-1 p-3 bg-slate-50 rounded-xl border border-slate-100 focus:border-indigo-500 focus:bg-white outline-none transition-all font-semibold"
                />
                <button type="submit" className="p-4 bg-indigo-600 text-white rounded-xl hover:bg-slate-900 transition-all shadow-md">
                   <Plus size={20} />
                </button>
             </form>
          </div>

          <div className="glass-card p-8 space-y-6">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <Mail size={20} />
                </div>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Lista de Autorizados</h2>
             </div>

             <div className="space-y-2">
                {emails.map((email: string) => (
                  <div key={email} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl group">
                    {editingEmail === email ? (
                      <div className="flex-1 flex gap-2">
                        <input 
                          autoFocus
                          type="email" 
                          value={tempEditedEmail}
                          onChange={e => setTempEditedEmail(e.target.value)}
                          className="flex-1 p-1 bg-white border border-indigo-200 rounded text-sm font-bold text-slate-700 outline-none"
                        />
                        <button onClick={() => handleUpdateEmail(email)} className="p-1 px-2 bg-indigo-600 text-white rounded text-[10px] font-black uppercase">Salvar</button>
                        <button onClick={() => setEditingEmail(null)} className="p-1 px-2 text-slate-400 hover:text-slate-600 rounded text-[10px] font-black uppercase">Cancelar</button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-bold text-slate-700">{email}</span>
                        <div className="flex items-center gap-1">
                          <button 
                            onClick={() => {
                              setEditingEmail(email);
                              setTempEditedEmail(email);
                            }}
                            className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => onDelete(email)}
                            disabled={email === 'diogoortega@gmail.com' || email === 'rodrigogomessdr@gmail.com'}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors disabled:opacity-0"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
             </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="glass-card p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-700 flex items-center justify-center text-white">
                  <LogIn size={20} />
                </div>
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Criar Conta de Usuário</h2>
              </div>
              
              <p className="text-xs text-slate-500 italic">Este formulário cria o usuário diretamente no banco de autenticação do Supabase.</p>

              {msg && (
                <div className={`p-4 rounded-xl text-xs font-bold ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                  {msg.text}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400">NOME EXIBIÇÃO</label>
                    <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" placeholder="Nome do Admin" />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400">E-MAIL</label>
                    <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" placeholder="admin@abadia.com" />
                 </div>
                 <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400">SENHA PROVISÓRIA</label>
                    <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl" placeholder="Mínimo 6 caracteres" />
                 </div>
                 <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all">
                    Criar Usuário no Supabase
                 </button>
              </form>
           </div>
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

function MembersView({ servers, onAdd, onUpdate, onDelete, stats }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ServerRole>('coroinha');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingId) {
      onUpdate(editingId, { name, type, email, whatsapp, birthDate });
      setEditingId(null);
    } else {
      onAdd({ name, type, email, whatsapp, birthDate });
    }

    setName('');
    setEmail('');
    setWhatsapp('');
    setBirthDate('');
    setType('coroinha');
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
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão de Pessoas</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Equipe Litúrgica</h1>
        </div>
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
           <button onClick={() => setType('acolito')} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${type === 'acolito' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-800'}`}>Acólitos</button>
           <button onClick={() => setType('coroinha')} className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${type === 'coroinha' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-800'}`}>Coroinhas</button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <UserPlus size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">
                {editingId ? 'Editar Membro' : 'Cadastro Manual'}
              </h2>
            </div>

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

        <div className="lg:col-span-2">
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
                      {s.name[0]}
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
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(s)} className="p-2 text-slate-200 hover:text-indigo-600 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => onDelete(s.id)} className="p-2 text-slate-200 hover:text-rose-500 transition-colors group/trash">
                      <Trash2 size={18} className="group-hover/trash:scale-110 transition-transform" />
                    </button>
                  </div>
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

function CommunitiesView({ communities, onAdd, onUpdate, onDelete }: any) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

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
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Gestão Territorial</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Comunidades</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

        <div className="lg:col-span-2">
          {communities.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center bg-white rounded-3xl border-2 border-dashed border-slate-200 text-center px-10">
              <MapPin size={48} className="text-slate-100 mb-4" />
              <p className="font-bold text-slate-400">Nenhuma comunidade cadastrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {communities.map((c: any) => (
                <div key={c.id} className="glass-card p-5 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                      <MapPin size={18} />
                    </div>
                    <h4 className="font-bold text-slate-800 uppercase text-sm tracking-tight">{c.name}</h4>
                  </div>
                  <div className="flex gap-1 transform opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(c)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => onDelete(c.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MassesView({ masses, onAdd, onUpdate, onDelete, communities }: any) {
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
    // Manter a localização selecionada se houver comunidades
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
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Agenda Litúrgica</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Celebrações</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-6">
           <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Church size={20} />
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

        <div className="lg:col-span-2 space-y-4">
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
                      <button onClick={() => startEdit(m)} className="p-3 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                        <ChevronRight size={20} />
                      </button>
                      <button onClick={() => onDelete(m.id)} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 size={20} />
                      </button>
                   </div>
                </div>
             ))
           )}
        </div>
      </div>
    </div>
  );
}

function ScheduleView({ masses, servers, onToggle, stats, autoSchedule, clearSchedule }: any) {
  const [selectedMassId, setSelectedMassId] = useState<string | null>(masses[0]?.id || null);
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
        <div className="space-y-1">
          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">Operação de Altar</p>
          <h1 className="text-4xl font-display font-black text-slate-900 tracking-tight">Montagem de Escala</h1>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={clearSchedule}
            className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all"
          >
             Limpar Tudo
          </button>
          <button 
            onClick={autoSchedule}
            className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-slate-900 transition-all"
          >
             <Layers size={16} /> Montagem Inteligente
          </button>
          <button 
            onClick={shareWhatsApp}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all"
          >
             <Share2 size={16} /> WhatsApp
          </button>
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all"
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
        <div className="flex-1 min-h-0 flex flex-col gap-8">
           {/* Horizonal Mass Selector */}
           <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 no-scrollbar shrink-0">
             {masses.map((m: any) => (
               <button
                 key={m.id}
                 onClick={() => setSelectedMassId(m.id)}
                 className={`group flex-shrink-0 w-[240px] p-5 rounded-[2rem] border transition-all text-left ${
                   selectedMassId === m.id ? 'bg-white border-indigo-600 shadow-2xl shadow-indigo-100 ring-4 ring-indigo-50/50' : 'bg-white opacity-60 hover:opacity-100 border-slate-100'
                 }`}
               >
                 <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center justify-between">
                   {m.date} <span className="text-slate-300">|</span> {m.time}
                 </p>
                 <h4 className="text-base font-bold text-slate-900 leading-tight mb-4 min-h-[2.5rem] line-clamp-2 uppercase tracking-tight">{m.title}</h4>
                 <div className="flex -space-x-2">
                    {Array.from({ length: Math.min(m.assignments.acolitos.length + m.assignments.coroinhas.length, 6) }).map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-black text-indigo-600">
                        {i + 1}
                      </div>
                    ))}
                    {(m.assignments.acolitos.length + m.assignments.coroinhas.length) > 6 && (
                      <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-white flex items-center justify-center text-[8px] font-black text-white">
                        +{ (m.assignments.acolitos.length + m.assignments.coroinhas.length) - 6 }
                      </div>
                    )}
                    {m.assignments.acolitos.length + m.assignments.coroinhas.length === 0 && (
                      <div className="w-full text-[10px] font-black text-slate-300 uppercase italic tracking-widest text-center mt-2 border border-dashed border-slate-100 py-1.5 rounded-lg">Sem escala</div>
                    )}
                 </div>
               </button>
             ))}
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
                          return (
                            <button
                              key={s.id}
                              onClick={() => onToggle(selectedMass.id, s.id, s.type)}
                              className={`w-full group flex items-center justify-between p-3 rounded-xl border transition-all text-left shadow-sm ${
                                isAssigned 
                                  ? 'bg-indigo-600 border-indigo-600 text-white' 
                                  : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] uppercase shadow-sm ${
                                  isAssigned ? 'bg-white/20 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'
                                }`}>
                                  {s.name[0]}
                                </div>
                                <div>
                                  <p className="text-xs font-bold leading-none mb-1">{s.name}</p>
                                  <p className={`text-[8px] font-black uppercase tracking-widest leading-none ${isAssigned ? 'text-indigo-200' : 'text-slate-300'}`}>{s.type}</p>
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
                            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-xl shadow-indigo-100">
                               <Church size={24} />
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
    </div>
  );
}
