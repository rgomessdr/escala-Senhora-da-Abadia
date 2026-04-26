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
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjsLib from 'pdfjs-dist';
import { GoogleGenAI, Type } from "@google/genai";
import { supabase, db as sdb, checkSupabaseConnection } from './lib/supabase';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
import { Server, Mass, View, ServerRole } from './types';
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
  throw error;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [servers, setServers] = useState<Server[]>([]);
  const [masses, setMasses] = useState<Mass[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState<{success: boolean, message: string} | null>(null);

  // Connection check
  useEffect(() => {
    checkSupabaseConnection().then(setConnStatus);
  }, []);

  const handleEmailLogin = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
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
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Data Fetching
  const fetchData = async () => {
    if (!user) return;
    
    try {
      const [serversRes, massesRes] = await Promise.all([
        sdb.servers.list(user.id),
        sdb.masses.list(user.id)
      ]);

      if (serversRes.error) throw serversRes.error;
      if (massesRes.error) throw massesRes.error;

      setServers(serversRes.data.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        active: s.active,
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
    } catch (err: any) {
      console.error("Error fetching data:", err);
      // Tratar erro de permissão (RLS)
      if (err.code === '42501' || err.message?.includes('permission denied') || err.message?.includes('Forbidden')) {
        alert("⚠️ ERRO DE PERMISSÃO: Você precisa configurar as Políticas (RLS) no Supabase. Vá em 'Autentication' -> 'Policies' e libere as tabelas 'servers' e 'masses' para usuários logados.");
      }
    }
  };

  useEffect(() => {
    fetchData();
    
    // Set up real-time subscriptions
    if (!user) return;

    const serversSub = supabase.channel('servers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'servers', filter: `owner_id=eq.${user.id}` }, () => fetchData())
      .subscribe();

    const massesSub = supabase.channel('masses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'masses', filter: `owner_id=eq.${user.id}` }, () => fetchData())
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

  const [isSeeding, setIsSeeding] = useState(false);
  const [isImportingDoc, setIsImportingDoc] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsImportingDoc(true);
    try {
      let textContent = "";

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          textContent += strings.join(" ") + "\n";
        }
      } else {
        textContent = await file.text();
      }

      if (!textContent.trim()) {
        throw new Error("Não foi possível extrair texto do documento.");
      }

      // 🔑 Call Gemini to parse
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === 'undefined') {
        throw new Error("Chave do Gemini (GEMINI_API_KEY) não encontrada. Se estiver no AI Studio, configure em 'Settings -> Secrets'. Se estiver no Vercel, adicione como 'Environment Variable'.");
      }

      const ai = new GoogleGenAI(apiKey);
      const model = ai.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: "Você é um assistente de gestão paroquial especializado em ler escalas de missa. Extraia os dados em JSON rigoroso. Regras: 1. Nomes devem ser limpos (Remover cargos). 2. Datas devem estar no formato YYYY-MM-DD. 3. Se não houver ano no texto, assuma 2026. 4. Identifique o Local da missa (ex: Matriz, Comunidade X)."
      });

      const prompt = `Analise este texto de escala e extraia:
      1. Lista de servidores: { "name": "NOME", "type": "acolito" ou "coroinha" }
      2. Lista de missas: { "title": "TÍTULO", "date": "YYYY-MM-DD", "time": "HH:MM", "location": "LOCAL", "acolitos": ["NOME1", "NOME2"], "coroinhas": ["NOME1"] }
      
      Importante: Retorne APENAS o JSON.
      
      Texto:
      """
      ${textContent}
      """`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Clean possible markdown backticks
      const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(cleanJson);
      if (!data.servers || !data.masses) throw new Error("A IA não conseguiu identificar os dados corretamente.");

      // --- Sync with Database ---
      const nameToId: Record<string, string> = {};
      servers.forEach(s => nameToId[s.name.trim().toLowerCase()] = s.id);

      // 1. Insert missing servers
      const newServers = data.servers.filter((s: any) => !nameToId[s.name.trim().toLowerCase()]);
      if (newServers.length > 0) {
        const { data: insertedServers, error: sError } = await sdb.servers.insert(
          newServers.map((s: any) => ({ 
            name: s.name.trim(), 
            type: s.type, 
            active: true, 
            owner_id: user.id 
          }))
        );
        if (sError) throw sError;
        insertedServers?.forEach(s => nameToId[s.name.trim().toLowerCase()] = s.id);
      }

      // 2. Insert masses
      const massesToInsert = data.masses.map((m: any) => ({
        title: m.title,
        date: m.date,
        time: m.time,
        location: m.location,
        assignments: {
          acolitos: m.acolitos.map((name: string) => nameToId[name.trim().toLowerCase()]).filter(Boolean),
          coroinhas: m.coroinhas.map((name: string) => nameToId[name.trim().toLowerCase()]).filter(Boolean)
        },
        ownerId: user.id
      }));

      if (massesToInsert.length > 0) {
        const { error: mError } = await sdb.masses.insert(massesToInsert);
        if (mError) throw mError;
      }

      alert(`Sucesso! Importados ${data.servers.length} servidores e ${data.masses.length} missas.`);
      fetchData();

    } catch (err: any) {
      console.error("Erro no processamento:", err);
      alert("Erro ao ler documento: " + err.message);
    } finally {
      setIsImportingDoc(false);
      event.target.value = '';
    }
  };

  // Seeding
  const seedBase = async () => {
    if (!user || isSeeding) return;
    if (!window.confirm("Deseja importar a base de dados REAL da Paróquia (Abril 2026)? Isso registrará todos os servidores e a escala completa do mês. Recomenda-se limpar os dados antigos se houver duplicidade.")) return;

    setIsSeeding(true);
    try {
      const acolitosNames = [
        "Daniel Queiroz De Souza", "Andrey Henrique Gotttems Rossatte", "Pedro Lucas Souza Bael",
        "Ezequiel Barbosa Velasco", "Mario Antonio Matiazi", "Júlia Machado Stival",
        "Leonardo Gabriel Alonso Moreira", "Lucas Andreetta Ortega", "Luiza Emanuelle De Siqueira Freitas",
        "Leonardo Alcântara", "Lara Beatriz Neves Barbosa (IR)", "Luiz Otavio Pereira",
        "Sarah Souza De Oliveira", "Ana Gabrielly Riquelme Fernandes", "Gabrielly Matos De Souza",
        "Eric Padilha De Matos"
      ];

      const coroinhasNames = [
        "Bárbara Kaori Muta Lo", "Yasmin Padilha Da Silva", "Bruno Jose Marques Limberger (IR)",
        "Maria Fernanda Alban Menezes", "Micaella Saracho Targa (IR)", "Maria Alice Rossoni Macarini",
        "Júlia Prates Gomes", "Elisa Patron Vicentin Moresco (IR)", "Ana Sofia Carriel Costa (IR)",
        "Carolina Pasinatto Tonini", "Beatriz Barbier de Oliveira (IR)", "Marina Tavares Moreira",
        "Luiz Otávio Straliotto Miotto (IR)", "Vitoria Camilo Rocha (IR)", "Ana Helena Menezes Ozorio",
        "Nicole Maria Silva Sá", "Laura Gimenes Knippelberg (IR)", "Antonella Oruê De Lima",
        "Cecilia Pereira Ferreira", "Maria Vitoria Bernardes Camara", "Gabriel dos Santos Cunico (IR)",
        "Milena de Oliveira Souza", "Luiza Carraro Hernandes", "Maria Cecilia Perdomo Veronka",
        "Ingrid Vitoria Rodrigues Dos Santos", "Maria Vitória Lima Rossoni", "Maria Alice Bogotoli",
        "Pedro Straliotto Silva", "Jordana Francener Colet", "Maria Fernanda Moraes de Carvalho",
        "Pedro Henrique Lepri Ribeiro", "Maria Valentina Portes Dos Santos", "Júlia Rodrigues Arakaki (IR)",
        "Barbara Frota Da Silva", "Renata Valentina Izolan Coldebella", "Miguel Angelo Dias De Lima",
        "Sofia Farias Bael", "Arthur Henrique Mareco Grubert", "João Miguel Moraes De Araújo",
        "Livia Camilo De Mendonça", "Alice Santolin Da Silva", "Miguel Figueiredo Biazotto",
        "Antonio Carlos de Souza Alba (IR)", "Lucas Borgert Oliveira (IR)"
      ];

      const nameToId: Record<string, string> = {};
      
      // Step 1: Identify existing servers
      servers.forEach(s => {
        nameToId[s.name.trim()] = s.id;
      });

      // Step 2: Prepare and insert missing servers
      const missingAcolitos = acolitosNames.filter(n => !nameToId[n.trim()]);
      const missingCoroinhas = coroinhasNames.filter(n => !nameToId[n.trim()]);

      if (missingAcolitos.length > 0 || missingCoroinhas.length > 0) {
        const serversToInsert = [
          ...missingAcolitos.map(n => ({ name: n.trim(), type: 'acolito', active: true, owner_id: user.id })),
          ...missingCoroinhas.map(n => ({ name: n.trim(), type: 'coroinha', active: true, owner_id: user.id }))
        ];
        
        const { data, error } = await sdb.servers.insert(serversToInsert);
        if (error) throw error;
        
        data?.forEach(s => {
          nameToId[s.name.trim()] = s.id;
        });
      }

      const getIds = (names: string[]) => names.map(n => nameToId[n.trim()]).filter(id => !!id);

      // --- APRIL 2026 REAL SCHEDULE ---
      const realMasses = [
        { title: "Missa de Domingo", date: "2026-04-05", time: "07:30", location: "Matriz", ac: ["Daniel Queiroz De Souza", "Andrey Henrique Gotttems Rossatte", "Pedro Lucas Souza Bael"], co: ["Bárbara Kaori Muta Lo", "Yasmin Padilha Da Silva", "Bruno Jose Marques Limberger (IR)", "Maria Fernanda Alban Menezes"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "08:00", location: "Nossa Senhora Das Graças", ac: ["Ezequiel Barbosa Velasco", "Mario Antonio Matiazi"], co: ["Micaella Saracho Targa (IR)", "Maria Alice Rossoni Macarini"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "09:00", location: "São José e São Bento", ac: ["Júlia Machado Stival", "Leonardo Gabriel Alonso Moreira"], co: ["Júlia Prates Gomes", "Elisa Patron Vicentin Moresco (IR)"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "10:00", location: "Matriz", ac: ["Lucas Andreetta Ortega", "Luiza Emanuelle De Siqueira Freitas", "Leonardo Alcântara"], co: ["Ana Sofia Carriel Costa (IR)", "Carolina Pasinatto Tonini", "Beatriz Barbier de Oliveira (IR)", "Marina Tavares Moreira"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "17:00", location: "Nossa Senhora Aparecida", ac: ["Lara Beatriz Neves Barbosa (IR)", "Luiz Otavio Pereira"], co: ["Luiz Otávio Straliotto Miotto (IR)", "Vitoria Camilo Rocha (IR)"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "19:00", location: "Matriz", ac: ["Sarah Souza De Oliveira", "Ana Gabrielly Riquelme Fernandes", "Gabrielly Matos De Souza"], co: ["Ana Helena Menezes Ozorio", "Nicole Maria Silva Sá", "Laura Gimenes Knippelberg (IR)", "Antonella Oruê De Lima"] },
        { title: "Missa de Domingo", date: "2026-04-05", time: "19:00", location: "São José Operário", ac: ["Luiz Otavio Pereira", "Lucas Andreetta Ortega"], co: ["Cecilia Pereira Ferreira", "Maria Vitoria Bernardes Camara"] },
        { title: "Missa/Terça", date: "2026-04-07", time: "19:00", location: "Caacupé", ac: ["Mario Antonio Matiazi"], co: ["Elisa Patron Vicentin Moresco (IR)", "Gabriel dos Santos Cunico (IR)"] },
        { title: "Missa/Quarta", date: "2026-04-08", time: "19:00", location: "Matriz", ac: ["Eric Padilha De Matos", "Pedro Lucas Souza Bael", "Sarah Souza De Oliveira"], co: ["Milena de Oliveira Souza", "Luiza Carraro Hernandes", "Maria Cecilia Perdomo Veronka", "Bruno Jose Marques Limberger (IR)"] },
        { title: "Missa/Quinta", date: "2026-04-09", time: "19:00", location: "São Vicente e São Benedito", ac: ["Daniel Queiroz De Souza"], co: ["Maria Cecilia Perdomo Veronka", "Maria Alice Rossoni Macarini"] },
        { title: "Missa/Sexta", date: "2026-04-10", time: "19:00", location: "Santa Luzia", ac: ["Eric Padilha De Matos", "Luiza Emanuelle De Siqueira Freitas", "Júlia Machado Stival"], co: ["Maria Vitória Lima Rossoni", "Ingrid Vitoria Rodrigues Dos Santos"] },
        { title: "Missa/Sábado", date: "2026-04-11", time: "19:00", location: "São Pedro e São Paulo", ac: ["Leonardo Gabriel Alonso Moreira", "Daniel Queiroz De Souza", "Lucas Andreetta Ortega"], co: ["Milena de Oliveira Souza", "Maria Alice Bogotoli"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "07:30", location: "Matriz", ac: ["Gabrielly Matos De Souza", "Sarah Souza De Oliveira", "Ana Gabrielly Riquelme Fernandes"], co: ["Pedro Straliotto Silva", "Jordana Francener Colet", "Maria Vitória Lima Rossoni", "Maria Fernanda Moraes de Carvalho"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "08:00", location: "Nossa Senhora Das Graças", ac: ["Lara Beatriz Neves Barbosa (IR)", "Leonardo Alcântara"], co: ["Pedro Henrique Lepri Ribeiro", "Maria Valentina Portes Dos Santos"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "09:00", location: "São José e São Bento", ac: ["Andrey Henrique Gotttems Rossatte", "Ezequiel Barbosa Velasco"], co: ["Júlia Rodrigues Arakaki (IR)", "Maria Alice Bogotoli"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "10:00", location: "Matriz", ac: ["Daniel Queiroz De Souza", "Mario Antonio Matiazi", "Júlia Machado Stival"], co: ["Bárbara Kaori Muta Lo", "Barbara Frota Da Silva", "Renata Valentina Izolan Coldebella", "Miguel Angelo Dias De Lima"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "17:00", location: "Nossa Senhora Aparecida", ac: ["Luiza Emanuelle De Siqueira Freitas", "Leonardo Gabriel Alonso Moreira"], co: ["Carolina Pasinatto Tonini", "Sofia Farias Bael"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "19:00", location: "Matriz", ac: ["Pedro Lucas Souza Bael", "Lucas Andreetta Ortega", "Luiz Otavio Pereira"], co: ["Cecilia Pereira Ferreira", "Arthur Henrique Mareco Grubert", "João Miguel Moraes De Araújo", "Ingrid Vitoria Rodrigues Dos Santos"] },
        { title: "Missa de Domingo", date: "2026-04-12", time: "19:00", location: "São José Operário", ac: ["Andrey Henrique Gotttems Rossatte", "Leonardo Alcântara"], co: ["Livia Camilo De Mendonça", "Alice Santolin Da Silva"] },
        { title: "Missa/Terça", date: "2026-04-14", time: "19:00", location: "Bom Samaritano", ac: ["Lara Beatriz Neves Barbosa (IR)"], co: ["Ana Sofia Carriel Costa (IR)", "João Miguel Moraes De Araújo"] },
        { title: "Novena", date: "2026-04-15", time: "19:00", location: "Matriz", ac: ["Ezequiel Barbosa Velasco", "Leonardo Gabriel Alonso Moreira", "Júlia Machado Stival"], co: ["Ana Sofia Carriel Costa (IR)", "Alice Santolin Da Silva", "Vitoria Camilo Rocha (IR)", "Arthur Henrique Mareco Grubert"] },
        { title: "Quinta-Feira Santa", date: "2026-04-16", time: "19:00", location: "São Vicente e São Benedito", ac: ["Mario Antonio Matiazi"], co: ["Pedro Straliotto Silva", "Pedro Henrique Lepri Ribeiro"] },
        { title: "Sexta-Feira Santa", date: "2026-04-17", time: "19:00", location: "Santa Luzia", ac: ["Lara Beatriz Neves Barbosa (IR)", "Leonardo Alcântara", "Sarah Souza De Oliveira"], co: ["Maria Valentina Portes Dos Santos", "Miguel Figueiredo Biazotto"] },
        { title: "Sábado de Aleluia", date: "2026-04-18", time: "19:00", location: "São Pedro e São Paulo", ac: ["Eric Padilha De Matos", "Luiza Emanuelle De Siqueira Freitas", "Luiz Otavio Pereira"], co: ["Livia Camilo De Mendonça", "Barbara Frota Da Silva"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "07:30", location: "Matriz", ac: ["Pedro Lucas Souza Bael", "Mario Antonio Matiazi", "Júlia Machado Stival"], co: ["Antonio Carlos de Souza Alba (IR)", "Júlia Rodrigues Arakaki (IR)", "Maria Valentina Portes Dos Santos", "Ingrid Vitoria Rodrigues Dos Santos"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "08:00", location: "Nossa Senhora Das Graças", ac: ["Ana Gabrielly Riquelme Fernandes", "Leonardo Gabriel Alonso Moreira"], co: ["Antonella Oruê De Lima", "Maria Vitoria Bernardes Camara"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "09:00", location: "São José e São Bento", ac: ["Sarah Souza De Oliveira", "Daniel Queiroz De Souza"], co: ["Livia Camilo De Mendonça", "Maria Vitória Lima Rossoni"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "10:00", location: "Matriz", ac: ["Ezequiel Barbosa Velasco", "Luiza Emanuelle De Siqueira Freitas", "Gabrielly Matos De Souza"], co: ["Carolina Pasinatto Tonini", "Lucas Borgert Oliveira (IR)", "Júlia Prates Gomes", "Maria Alice Bogotoli"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "17:00", location: "Nossa Senhora Aparecida", ac: ["Lucas Andreetta Ortega", "Lara Beatriz Neves Barbosa (IR)"], co: ["Bruno Jose Marques Limberger (IR)", "Arthur Henrique Mareco Grubert"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "19:00", location: "Matriz", ac: ["Leonardo Alcântara", "Andrey Henrique Gotttems Rossatte", "Eric Padilha De Matos"], co: ["Alice Santolin Da Silva", "Ana Helena Menezes Ozorio", "Yasmin Padilha Da Silva", "Sofia Farias Bael"] },
        { title: "Missa de Páscoa", date: "2026-04-19", time: "19:00", location: "São José Operário", ac: ["Luiz Otavio Pereira", "Ana Gabrielly Riquelme Fernandes"], co: ["Cecilia Pereira Ferreira", "Luiz Otávio Straliotto Miotto (IR)"] },
        { title: "Missa/Terça", date: "2026-04-21", time: "19:00", location: "Caacupé", ac: ["Eric Padilha De Matos"], co: ["Pedro Straliotto Silva", "Laura Gimenes Knippelberg (IR)"] },
        { title: "Missa/Quarta", date: "2026-04-22", time: "19:00", location: "Matriz", ac: ["Ana Gabrielly Riquelme Fernandes", "Pedro Lucas Souza Bael", "Eric Padilha De Matos"], co: ["Gabriel dos Santos Cunico (IR)", "Ana Helena Menezes Ozorio", "Antonio Carlos de Souza Alba (IR)", "Júlia Rodrigues Arakaki (IR)"] },
        { title: "Missa/Quinta", date: "2026-04-23", time: "19:00", location: "São Vicente e São Benedito", ac: ["Luiz Otavio Pereira"], co: ["Miguel Figueiredo Biazotto", "Maria Cecilia Perdomo Veronka"] },
        { title: "Missa/Sexta", date: "2026-04-24", time: "19:00", location: "Santa Luzia", ac: ["Daniel Queiroz De Souza", "Lucas Andreetta Ortega", "Ezequiel Barbosa Velasco"], co: ["Micaella Saracho Targa (IR)", "Luiz Otávio Straliotto Miotto (IR)"] },
        { title: "Missa/Sábado", date: "2026-04-25", time: "19:00", location: "São Pedro e São Paulo", ac: ["Pedro Lucas Souza Bael", "Ana Gabrielly Riquelme Fernandes", "Leonardo Alcântara"], co: ["Jordana Francener Colet", "Maria Vitoria Bernardes Camara"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "07:30", location: "Matriz", ac: ["Leonardo Gabriel Alonso Moreira", "Sarah Souza De Oliveira", "Gabrielly Matos De Souza"], co: ["Milena de Oliveira Souza", "Miguel Figueiredo Biazotto", "João Miguel Moraes De Araújo", "Miguel Angelo Dias De Lima"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "08:00", location: "Nossa Senhora Das Graças", ac: ["Daniel Queiroz De Souza", "Luiza Emanuelle De Siqueira Freitas"], co: ["Vitoria Camilo Rocha (IR)", "Maria Alice Rossoni Macarini"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "09:00", location: "São José e São Bento", ac: ["Ezequiel Barbosa Velasco", "Mario Antonio Matiazi"], co: ["Bárbara Kaori Muta Lo", "Micaella Saracho Targa (IR)"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "10:00", location: "Matriz", ac: ["Eric Padilha De Matos", "Júlia Machado Stival", "Pedro Lucas Souza Bael"], co: ["Gabriel dos Santos Cunico (IR)", "Beatriz Barbier de Oliveira (IR)", "Pedro Henrique Lepri Ribeiro", "Laura Gimenes Knippelberg (IR)"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "17:00", location: "Nossa Senhora Aparecida", ac: ["Leonardo Alcântara", "Ana Gabrielly Riquelme Fernandes"], co: ["Carolina Pasinatto Tonini", "Lucas Borgert Oliveira (IR)"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "19:00", location: "Matriz", ac: ["Lara Beatriz Neves Barbosa (IR)", "Lucas Andreetta Ortega", "Luiz Otavio Pereira"], co: ["Antonio Carlos de Souza Alba (IR)", "Maria Fernanda Alban Menezes", "Marina Tavares Moreira", "Jordana Francener Colet"] },
        { title: "Missa de Domingo", date: "2026-04-26", time: "19:00", location: "São José Operário", ac: ["Andrey Henrique Gotttems Rossatte", "Ezequiel Barbosa Velasco"], co: ["Cecilia Pereira Ferreira", "Barbara Frota Da Silva"] },
        { title: "Missa/Terça", date: "2026-04-28", time: "19:00", location: "Bom Samaritano", ac: ["Luiza Emanuelle De Siqueira Freitas"], co: ["Yasmin Padilha Da Silva", "Miguel Angelo Dias De Lima"] },
        { title: "Missa/Quarta", date: "2026-04-29", time: "19:00", location: "Matriz", ac: ["Mario Antonio Matiazi", "Sarah Souza De Oliveira", "Júlia Machado Stival"], co: ["Cecilia Pereira Ferreira", "Antonella Oruê De Lima", "Marina Tavares Moreira", "Sofia Farias Bael"] },
        { title: "Missa/Quinta", date: "2026-04-30", time: "19:00", location: "São Vicente e São Benedito", ac: ["Lara Beatriz Neves Barbosa (IR)"], co: ["Lucas Borgert Oliveira (IR)", "Maria Fernanda Alban Menezes"] },
      ];

      // Step 3: Insert/Update masses
      const massesToInsert: any[] = [];
      const massesToUpdate: any[] = [];

      realMasses.forEach((mass) => {
        const massData = {
          title: mass.title,
          date: mass.date,
          time: mass.time,
          location: mass.location,
          assignments: {
            acolitos: getIds(mass.ac),
            coroinhas: getIds(mass.co)
          },
          ownerId: user.id
        };
        
        const existingMass = masses.find(m => m.date === mass.date && m.time === mass.time && m.location === mass.location);
        if (existingMass) {
          massesToUpdate.push({ id: existingMass.id, ...massData });
        } else {
          massesToInsert.push(massData);
        }
      });

      // --- MAY 2026 TEMPLATES ---
      const mayDates = ["2026-05-03", "2026-05-10", "2026-05-17", "2026-05-24", "2026-05-31"];
      mayDates.forEach(d => {
        const isMothersDay = d === "2026-05-10";
        const isPentecost = d === "2026-05-24";
        
        const massTemplates = [
          { title: isMothersDay ? "Missa de Dia das Mães" : (isPentecost ? "Missa de Pentecostes" : "Missa de Domingo"), time: "07:30", location: "Matriz" },
          { title: "Missa de Domingo", time: "08:00", location: "Nossa Senhora Das Graças" },
          { title: "Missa de Domingo", time: "09:00", location: "São José e São Bento" },
          { title: isMothersDay ? "Missa de Dia das Mães" : (isPentecost ? "Missa de Pentecostes" : "Missa de Domingo"), time: "10:00", location: "Matriz" },
          { title: "Missa de Domingo", time: "17:00", location: "Nossa Senhora Aparecida" },
          { title: isMothersDay ? "Missa de Dia das Mães" : (isPentecost ? "Missa de Pentecostes" : "Missa de Domingo"), time: "19:00", location: "Matriz" },
          { title: "Missa de Domingo", time: "19:00", location: "São José Operário" },
        ];
        
        massTemplates.forEach((template) => {
          const exists = masses.find(m => m.date === d && m.time === template.time && m.location === template.location);
          if (!exists) {
            massesToInsert.push({ 
              ...template, 
              date: d, 
              assignments: { acolitos: [], coroinhas: [] }, 
              ownerId: user.id 
            });
          }
        });
      });

      if (massesToInsert.length > 0) {
        const { error } = await sdb.masses.insert(massesToInsert);
        if (error) throw error;
      }
      
      for (const m of massesToUpdate) {
        const { error } = await sdb.masses.update(m.id, m);
        if (error) throw error;
      }
      
      alert("Base de dados REAL de Abril 2026 importada com sucesso!");
    } catch (err: any) {
      console.error("Erro ao importar base:", err);
      if (err.code === '42501' || err.message?.includes('permission denied') || err.message?.includes('Forbidden')) {
        alert("⚠️ ERRO DE PERMISSÃO: O Supabase bloqueou a gravação. Você precisa rodar o script SQL de Permissões (Policies/RLS) no console do Supabase para liberar as tabelas 'servers' e 'masses'.");
      } else {
        alert("Houve um erro ao importar a base: " + (err.message || "Verifique sua conexão."));
      }
    } finally {
      setIsSeeding(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const clearAllData = async () => {
    if (!user || isDeleting) return;
    if (!window.confirm("ATENÇÃO: Isso apagará TODOS os servidores e missas cadastrados. Deseja continuar?")) return;
    
    setIsDeleting(true);
    try {
      // Delete all servers and masses for the current user
      const { error: serverErr } = await supabase.from('servers').delete().eq('owner_id', user.id);
      if (serverErr) throw serverErr;
      
      const { error: massErr } = await supabase.from('masses').delete().eq('owner_id', user.id);
      if (massErr) throw massErr;
      
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
  const addServer = async (name: string, type: ServerRole) => {
    if (!user) return;
    try {
      const { error } = await sdb.servers.insert({
        name,
        type,
        active: true,
        ownerId: user.id
      });
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.CREATE, 'servers');
    }
  };

  const removeServer = async (id: string) => {
    try {
      const { error } = await sdb.servers.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, `servers/${id}`);
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
    try {
      const { error } = await sdb.masses.delete(id);
      if (error) throw error;
      fetchData();
    } catch (err) {
      handleSupabaseError(err, OperationType.DELETE, `masses/${id}`);
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
        onEmailRegister={handleEmailRegister}
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
                  className={`w-2 h-2 rounded-full ${connStatus.success ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} 
                  title={connStatus.message}
                />
              )}
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Gestão de Escalas • MS</p>
          </div>
        </div>

        {/* View Switcher - Desktop */}
        <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <NavTab active={view === 'dashboard'} onClick={() => setView('dashboard')} label="Dashboard" />
          <NavTab active={view === 'members'} onClick={() => setView('members')} label="Membros" />
          <NavTab active={view === 'masses'} onClick={() => setView('masses')} label="Missas" />
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
                <NavButtonView active={view === 'masses'} onClick={() => { setView('masses'); setIsSidebarOpen(false); }} icon={<Church size={18} />} label="Missas" />
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
                seedBase={seedBase} 
                isSeeding={isSeeding} 
                clearAllData={clearAllData} 
                isDeleting={isDeleting}
                isImportingDoc={isImportingDoc}
                handleFileUpload={handleFileUpload}
              />
            )}
            {view === 'members' && <MembersView servers={servers} onAdd={addServer} onDelete={removeServer} stats={serverStats} />}
            {view === 'masses' && <MassesView masses={masses} onAdd={addMass} onDelete={removeMass} />}
            {view === 'schedule' && <ScheduleView masses={masses} servers={servers} onToggle={toggleAssignment} stats={serverStats} autoSchedule={autoSchedule} clearSchedule={clearSchedule} />}
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
  onEmailRegister, 
  error 
}: { 
  onEmailLogin: (email: string, pass: string) => void,
  onEmailRegister: (email: string, pass: string, name: string) => void,
  error: string | null
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      if (!name) return;
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
              <h2 className="text-xl font-bold text-slate-800">{isRegistering ? 'Nova Conta Paroquial' : 'Portal do Altar'}</h2>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {isRegistering ? 'Cadastre a equipe da nossa paróquia.' : 'Acesse a gestão de acólitos e coroinhas da Abadia.'}
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seu Nome</label>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                    placeholder="Ex: João Silva"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail</label>
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 outline-none transition-all shadow-inner"
                  placeholder="paroquia@exemplo.com"
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
                className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
              >
                {isRegistering ? <UserPlus size={18} /> : <LogIn size={18} />}
                {isRegistering ? 'Criar Cadastro' : 'Entrar no Sistema'}
              </button>
            </form>

            <div className="text-center pt-2 space-y-4">
              <button 
                type="button"
                onClick={() => setIsRegistering(!isRegistering)}
                className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest transition-colors flex flex-col items-center gap-1 mx-auto"
              >
                {isRegistering ? (
                  <>
                    <span>Já possui uma conta?</span>
                    <span className="text-sm font-bold normal-case">Fazer Login</span>
                  </>
                ) : (
                  <>
                    <span>Novo administrador?</span>
                    <span className="text-sm font-bold normal-case">Criar nova conta de acesso</span>
                  </>
                )}
              </button>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight leading-relaxed max-w-[200px] mx-auto text-center">
                  Utilizando Supabase para autenticação e banco de dados SQL.
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
  seedBase, 
  isSeeding, 
  clearAllData, 
  isDeleting,
  isImportingDoc,
  handleFileUpload
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
              disabled={isDeleting || isSeeding}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-rose-200 text-rose-500 rounded-xl text-sm font-bold hover:bg-rose-50 transition-all disabled:opacity-50"
            >
               {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
               {isDeleting ? 'Excluindo...' : 'Limpar Dados'}
            </button>
            <button 
              onClick={() => document.getElementById('pdf-upload')?.click()}
              disabled={isImportingDoc || isDeleting || isSeeding}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-emerald-200 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-50 transition-all disabled:opacity-50"
            >
               {isImportingDoc ? <Loader2 className="animate-spin" size={18} /> : <Share2 size={18} />}
               {isImportingDoc ? 'Lendo...' : 'Importar PDF/Doc'}
               <input 
                 id="pdf-upload" 
                 type="file" 
                 accept=".pdf,.txt" 
                 className="hidden" 
                 onChange={handleFileUpload} 
               />
            </button>
            <button 
              onClick={seedBase}
              disabled={isSeeding || isDeleting}
              className="flex items-center gap-2 px-5 py-3 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-all disabled:opacity-50 disabled:cursor-wait"
            >
               {isSeeding ? <Loader2 className="animate-spin" size={18} /> : <Download size={18} />}
               {isSeeding ? 'Importando...' : 'Importar Dados Reais (Abril)'}
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

function MembersView({ servers, onAdd, onDelete, stats }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ServerRole>('coroinha');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name, type);
    setName('');
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
          <form onSubmit={handleSubmit} className="glass-card p-8 sticky top-24 space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <UserPlus size={20} />
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Novo Cadastro</h2>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Nome Social / Completo</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Gabriel Martins"
                  className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-0 outline-none transition-all font-semibold shadow-inner"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Função Canônica</label>
                <div className="grid grid-cols-2 gap-3">
                  <RoleSelector active={type === 'acolito'} onClick={() => setType('acolito')} label="Acólito" />
                  <RoleSelector active={type === 'coroinha'} onClick={() => setType('coroinha')} label="Coroinha" />
                </div>
              </div>

              <button type="submit" className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                <Plus size={18} /> Cadastrar Membro
              </button>
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
                <motion.div layout key={s.id} className="glass-card glass-card-hover p-4 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-lg ${s.type === 'acolito' ? 'bg-indigo-600' : 'bg-blue-600'}`}>
                      {s.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors uppercase text-sm leading-none mb-1.5">{s.name}</h4>
                      <div className="flex items-center gap-2">
                         <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase tracking-widest ${s.type === 'acolito' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                           {s.type}
                         </span>
                         <span className="text-[10px] font-mono font-bold text-slate-400">{stats[s.id] || 0} Missas</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => onDelete(s.id)} className="p-2 text-slate-200 hover:text-rose-500 transition-colors group/trash">
                      <Trash2 size={18} className="group-hover/trash:scale-110 transition-transform" />
                    </button>
                    <button className="p-2 text-slate-200 hover:text-indigo-600 transition-colors">
                      <MoreVertical size={18} />
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

function MassesView({ masses, onAdd, onDelete }: any) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('Matriz Paroquial');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date || !time) return;
    onAdd(title, date, time, location);
    setTitle('');
    setDate('');
    setTime('');
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
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Novo Evento</h2>
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
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-bold" />
              </div>
              <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl">
                 Agendar Missa
              </button>
            </div>
        </form>

        <div className="lg:col-span-2 space-y-4">
           {masses.length === 0 ? (
             <div className="h-64 flex flex-col items-center justify-center glass-card border-dashed">
                <Calendar size={48} className="text-slate-100 mb-4" />
                <p className="font-bold text-slate-400">Nenhuma celebração agendada.</p>
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
                   <div className="flex items-center md:flex-col md:items-end gap-4 md:gap-2">
                      <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest md:mb-1">Participantes: {m.assignments.acolitos.length + m.assignments.coroinhas.length}</div>
                      <button onClick={() => onDelete(m.id)} className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
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
