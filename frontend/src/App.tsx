import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, AlertCircle, CheckCircle, Clock, Heart, Activity, 
  FileText, BarChart3, Send, X, Calendar, Menu, Image, File, Check,
  Home, ChevronLeft, Zap, Shield, TrendingUp, Eye, Edit3, Save, User,
  Search, BookOpen, Brain, Smile, Trash2, Lightbulb
} from 'lucide-react';
import './App.css';

// Types
interface DadosPaciente {
  nome: string | null;
  idade: number | null;
  sexo: string | null;
  data_exame: string | null;
}

interface EcoResult {
  tem_estenose: boolean;
  gravidade: string;
  area_valvar: number | null;
  gradiente_medio: number | null;
  velocidade_maxima: number | null;
  prioridade: string;
  justificativa: string;
  indicacao_tavi: boolean;
  confianca: number;
  paciente?: DadosPaciente;
}

interface LaudoProcessado {
  id: string;
  db_id?: number;  // ID do banco PostgreSQL para feedback
  arquivo: string;
  formato: string;
  timestamp: string;
  analise: EcoResult;
  texto_original?: string;
  encaminhado: boolean;
  data_encaminhamento?: string;
  lessons_count?: number;
  editado_manualmente?: boolean;
  campos_editados?: string[];
  data_ultima_edicao?: string;
  recebeu_feedback?: boolean;  // Badge persistido no banco
  editado_em?: string;  // Timestamp de quando foi editado
  corrigido_em?: string;  // Timestamp de quando recebeu feedback
}

interface LessonLearned {
  id: number;
  regra: string;
  quando_aplicar: string;
  exemplo: string;
  categoria: string;
  ativa?: boolean;
  created_at?: string;
  laudo_id?: number;
  analise_original?: EcoResult;
  analise_corrigida?: EcoResult;
  feedback_medico?: string;
  paciente?: DadosPaciente;
}

interface FeedbackResponse {
  success: boolean;
  lesson?: LessonLearned;
  nova_analise?: EcoResult;
  message: string;
}

type FeedbackStatus = 'idle' | 'revisando' | 'aprendendo' | 'incorporado' | 'error';

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  result?: LaudoProcessado;
  error?: string;
}

interface Stats {
  total_laudos: number;
  indicacao_tavi: number;
  prioridade_alta: number;
  prioridade_media: number;
  prioridade_baixa: number;
  encaminhados: number;
  periodo: string;
  por_gravidade?: Record<string, number>;
}

type View = 'home' | 'upload' | 'dashboard' | 'lessons';
type Periodo = 'dia' | 'semana' | 'mes' | 'todos' | 'custom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
console.log('Using API URL:', API_URL);
const FORMATOS_ACEITOS = '.pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.bmp';

function App() {
  const [view, setView] = useState<View>('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);
  const [internalView, setInternalView] = useState<'upload' | 'dashboard'>('upload');
  
  const [uploadFiles, setUploadFiles] = useState<FileUploadStatus[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const [laudos, setLaudos] = useState<LaudoProcessado[]>([]);
  const [sessionLaudos, setSessionLaudos] = useState<LaudoProcessado[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  const [stats, setStats] = useState<Stats | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('todos');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  
  // Modal de detalhes/edição
  const [selectedLaudo, setSelectedLaudo] = useState<LaudoProcessado | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  
  // Modal de visualização de imagem
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Filtros do dashboard
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPrioridade, setFilterPrioridade] = useState<string>('');
  const [filterEncaminhado, setFilterEncaminhado] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const LAUDOS_PER_PAGE = 50;
  
  // Modal de feedback/correção
  const [feedbackLaudo, setFeedbackLaudo] = useState<LaudoProcessado | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>('idle');
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResponse | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  
  // Feedback inline no modal de detalhes
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [laudosCorrigidos, setLaudosCorrigidos] = useState<Set<string>>(new Set());
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [inlineFeedbackText, setInlineFeedbackText] = useState('');
  const [inlineFeedbackStatus, setInlineFeedbackStatus] = useState<'idle' | 'revisando' | 'aprendendo' | 'agradecimento'>('idle');
  
  // Lessons
  const [lessons, setLessons] = useState<LessonLearned[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<LessonLearned | null>(null);
  const [lessonTab, setLessonTab] = useState<'antes' | 'depois'>('antes');
  
  // Modal de confirmação de deleção
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: 'laudo' | 'lesson';
    id: string | number | null;
    title: string;
    multiple?: boolean;
    ids?: (string | number)[];
  }>({ open: false, type: 'laudo', id: null, title: '' });
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  // Seleção múltipla
  const [selectedLaudos, setSelectedLaudos] = useState<Set<string>>(new Set());
  const [selectedLessonsIds, setSelectedLessonsIds] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  
  // Ref para auto-scroll da lista de arquivos
  const fileListRef = useRef<HTMLDivElement>(null);
  const userScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(async () => {
    try {
      setApiError(null);
      let url = `${API_URL}/estatisticas?periodo=${periodo}`;
      if (periodo === 'custom' && customDateStart && customDateEnd) {
        url = `${API_URL}/estatisticas?periodo=custom&data_inicio=${customDateStart}&data_fim=${customDateEnd}`;
      }
      const statsRes = await fetch(url);
      if (!statsRes.ok) throw new Error('Erro ao carregar estatísticas');
      const statsData = await statsRes.json();
      setStats(statsData);
      
      let laudosUrl = `${API_URL}/laudos?periodo=${periodo}`;
      if (periodo === 'custom' && customDateStart && customDateEnd) {
        laudosUrl = `${API_URL}/laudos?periodo=custom&data_inicio=${customDateStart}&data_fim=${customDateEnd}`;
      }
      const laudosRes = await fetch(laudosUrl);
      if (!laudosRes.ok) throw new Error('Erro ao carregar laudos');
      const laudosData = await laudosRes.json();
      setLaudos(laudosData.laudos || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  }, [periodo, customDateStart, customDateEnd]);

  useEffect(() => {
    if (view !== 'home' && view !== 'lessons') loadData();
  }, [loadData, view]);

  // Detectar URL para navegação
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/lessons') {
      setView('lessons');
    } else if (path === '/dashboard') {
      setView('dashboard');
    } else if (path === '/upload') {
      setView('upload');
    }
  }, []);

  // Carregar lessons
  const loadLessons = useCallback(async () => {
    try {
      console.log('[Lessons] Carregando lessons...');
      const res = await fetch(`${API_URL}/lessons`);
      if (!res.ok) throw new Error('Erro ao carregar lessons');
      const data = await res.json();
      console.log('[Lessons] Retornado:', data);
      setLessons(data.lessons || []);
    } catch (error) {
      console.error('[Lessons] Erro ao carregar lessons:', error);
    }
  }, []);

  useEffect(() => {
    if (view === 'lessons') loadLessons();
  }, [view, loadLessons]);

  // Deletar laudo
  const deleteLaudo = async (laudoId: string) => {
    try {
      const res = await fetch(`${API_URL}/laudos/${laudoId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao deletar laudo');
      setLaudos(prev => prev.filter(l => l.id !== laudoId));
      if (selectedLaudo?.id === laudoId) {
        setSelectedLaudo(null);
      }
      setDeleteModal({ open: false, type: 'laudo', id: null, title: '' });
      setDeleteConfirmText('');
      loadData();
    } catch (error) {
      console.error('Erro ao deletar laudo:', error);
    }
  };

  // Deletar lesson
  const deleteLesson = async (lessonId: number) => {
    try {
      const res = await fetch(`${API_URL}/lessons/${lessonId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Erro ao deletar lesson');
      setLessons(prev => prev.filter(l => l.id !== lessonId));
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(null);
      }
      setDeleteModal({ open: false, type: 'laudo', id: null, title: '' });
      setDeleteConfirmText('');
    } catch (error) {
      console.error('Erro ao deletar lesson:', error);
    }
  };

  // Abrir modal de confirmação de deleção
  const openDeleteModal = (type: 'laudo' | 'lesson', id: string | number, title: string) => {
    setDeleteModal({ open: true, type, id, title });
    setDeleteConfirmText('');
  };

  // Confirmar deleção
  const confirmDelete = async () => {
    // Deleção múltipla
    if (deleteModal.multiple && deleteModal.ids && deleteModal.ids.length > 0) {
      for (const id of deleteModal.ids) {
        if (deleteModal.type === 'laudo') {
          await deleteLaudo(id as string);
        } else if (deleteModal.type === 'lesson') {
          await deleteLesson(id as number);
        }
      }
      // Limpar seleção
      if (deleteModal.type === 'laudo') {
        setSelectedLaudos(new Set());
      } else {
        setSelectedLessonsIds(new Set());
      }
      setSelectionMode(false);
    } else {
      // Deleção única
      if (deleteModal.type === 'laudo' && deleteModal.id) {
        deleteLaudo(deleteModal.id as string);
      } else if (deleteModal.type === 'lesson' && deleteModal.id) {
        deleteLesson(deleteModal.id as number);
      }
    }
    setDeleteModal({ open: false, type: 'laudo', id: null, title: '' });
  };
  
  // Toggle seleção de laudo
  const toggleLaudoSelection = (laudoId: string) => {
    setSelectedLaudos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(laudoId)) {
        newSet.delete(laudoId);
      } else {
        newSet.add(laudoId);
      }
      return newSet;
    });
  };
  
  // Toggle seleção de lesson
  const toggleLessonSelection = (lessonId: number) => {
    setSelectedLessonsIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lessonId)) {
        newSet.delete(lessonId);
      } else {
        newSet.add(lessonId);
      }
      return newSet;
    });
  };
  
  // Deletar selecionados
  const deleteSelectedItems = (type: 'laudo' | 'lesson') => {
    const ids = type === 'laudo' ? Array.from(selectedLaudos) : Array.from(selectedLessonsIds);
    if (ids.length === 0) return;
    setDeleteModal({
      open: true,
      type,
      id: null,
      title: `${ids.length} ${type === 'laudo' ? 'laudos' : 'lessons'} selecionados`,
      multiple: true,
      ids
    });
  };

  // Carregar detalhes de uma lesson
  const loadLessonDetails = async (lessonId: number) => {
    try {
      const res = await fetch(`${API_URL}/lessons/${lessonId}`);
      if (!res.ok) throw new Error('Erro ao carregar lesson');
      const data = await res.json();
      setSelectedLesson(data);
      setLessonTab('antes');
    } catch (error) {
      console.error('Erro ao carregar lesson:', error);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const addFiles = (files: File[]) => {
    const newFiles: FileUploadStatus[] = files.map(file => ({
      file,
      status: 'pending',
      progress: 0
    }));
    setUploadFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Processar próximo arquivo pendente
  const processNextFile = useCallback(async () => {
    const pendingIndex = uploadFiles.findIndex(f => f.status === 'pending');
    if (pendingIndex === -1) {
      if (isProcessing) {
        setIsProcessing(false);
        loadData();
      }
      return;
    }
    
    if (!isProcessing) setIsProcessing(true);
    
    // Marcar como uploading
    setUploadFiles(prev => prev.map((f, i) => 
      i === pendingIndex ? { ...f, status: 'uploading' as const, progress: 0 } : f
    ));
    
    // Fake progress animation
    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
      fakeProgress += Math.random() * 12 + 3;
      if (fakeProgress > 85) fakeProgress = 85;
      setUploadFiles(prev => prev.map((f, i) => 
        i === pendingIndex ? { ...f, progress: Math.round(fakeProgress) } : f
      ));
    }, 400);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadFiles[pendingIndex].file);
      
      const response = await fetch(`${API_URL}/analisar-arquivo`, {
        method: 'POST',
        body: formData
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Erro no servidor' }));
        throw new Error(errorData.detail || `Erro HTTP ${response.status}`);
      }
      
      const result = await response.json();
      setUploadFiles(prev => prev.map((f, i) => 
        i === pendingIndex ? { ...f, status: 'success' as const, progress: 100, result } : f
      ));
      setLaudos(prev => [result, ...prev]);
      setSessionLaudos(prev => [result, ...prev]);
      
    } catch (error) {
      clearInterval(progressInterval);
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      setUploadFiles(prev => prev.map((f, i) => 
        i === pendingIndex ? { ...f, status: 'error' as const, error: errorMsg } : f
      ));
      if (errorMsg.includes('API') || errorMsg.includes('key') || errorMsg.includes('authentication') || errorMsg.includes('rate')) {
        setApiError('Erro de autenticação ou rate limit da API. Verifique a ANTHROPIC_API_KEY no backend.');
      }
    }
  }, [uploadFiles, isProcessing, loadData]);

  // Effect para processar fila automaticamente
  useEffect(() => {
    const hasUploading = uploadFiles.some(f => f.status === 'uploading');
    const hasPending = uploadFiles.some(f => f.status === 'pending');
    
    if (!hasUploading && hasPending) {
      const timer = setTimeout(() => processNextFile(), 500);
      return () => clearTimeout(timer);
    }
  }, [uploadFiles, processNextFile]);

  // Effect para auto-scroll quando muda o arquivo sendo processado
  const prevUploadingIndexRef = useRef(-1);
  
  useEffect(() => {
    if (userScrollingRef.current) return;
    if (!fileListRef.current) return;
    
    const currentUploadingIndex = uploadFiles.findIndex(f => f.status === 'uploading');
    if (currentUploadingIndex === -1) return;
    if (currentUploadingIndex === prevUploadingIndexRef.current) return;
    
    prevUploadingIndexRef.current = currentUploadingIndex;
    
    // Usar requestAnimationFrame para garantir que o DOM está atualizado
    requestAnimationFrame(() => {
      if (!fileListRef.current) return;
      const container = fileListRef.current;
      const items = container.children;
      if (items[currentUploadingIndex]) {
        const el = items[currentUploadingIndex] as HTMLElement;
        const containerRect = container.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const relativeTop = elRect.top - containerRect.top + container.scrollTop;
        const scrollTarget = relativeTop - (container.clientHeight / 2) + (el.offsetHeight / 2);
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      }
    });
  }, [uploadFiles]);

  const clearCompleted = () => {
    setUploadFiles(prev => prev.filter(f => f.status === 'pending' || f.status === 'uploading'));
  };

  const toggleEncaminhado = async (laudoId: string, encaminhado: boolean) => {
    try {
      await fetch(`${API_URL}/encaminhar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ laudo_id: laudoId, encaminhado })
      });
      setLaudos(prev => prev.map(l => 
        l.id === laudoId ? { ...l, encaminhado, data_encaminhamento: encaminhado ? new Date().toISOString() : undefined } : l
      ));
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar encaminhamento:', error);
    }
  };

  // Função para processar feedback e aprender
  const processFeedback = async () => {
    if (!feedbackLaudo || !feedbackText.trim() || !feedbackLaudo.db_id) {
      setFeedbackError('Laudo não possui ID do banco de dados para feedback');
      return;
    }
    
    setFeedbackStatus('revisando');
    setFeedbackError(null);
    
    // Etapa 1: Revisando comentário (~2s)
    await new Promise(r => setTimeout(r, 2000));
    setFeedbackStatus('aprendendo');
    
    // Etapa 2: Aprendendo (~2s) + chamada API
    try {
      const res = await fetch(`${API_URL}/feedback/processar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laudo_id: feedbackLaudo.db_id,
          correcao: feedbackText
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao processar feedback');
      }
      
      const result: FeedbackResponse = await res.json();
      
      await new Promise(r => setTimeout(r, 1500));
      setFeedbackStatus('incorporado');
      setFeedbackResult(result);
      
    } catch (error) {
      setFeedbackStatus('error');
      setFeedbackError(error instanceof Error ? error.message : 'Erro desconhecido');
    }
  };

  const closeFeedbackModal = () => {
    setFeedbackLaudo(null);
    setFeedbackText('');
    setFeedbackStatus('idle');
    setFeedbackResult(null);
    setFeedbackError(null);
  };

  const openFeedbackModal = (laudo: LaudoProcessado) => {
    setFeedbackLaudo(laudo);
    setFeedbackText('');
    setFeedbackStatus('idle');
    setFeedbackResult(null);
    setFeedbackError(null);
  };

  // Função para processar feedback inline
  const processInlineFeedback = async () => {
    if (!selectedLaudo || !inlineFeedbackText.trim() || !selectedLaudo.db_id) {
      return;
    }
    
    setInlineFeedbackStatus('revisando');
    setFeedbackError(null);
    
    try {
      console.log('[Feedback] Iniciando processamento de feedback inline...');
      
      // Etapa 1: Revisando comentário (~1.5s)
      await new Promise(r => setTimeout(r, 1500));
      
      setInlineFeedbackStatus('aprendendo');
      console.log('[Feedback] Chamando API /feedback/processar...');
      
      // Etapa 2: Aprendendo com o caso + chamada API
      const res = await fetch(`${API_URL}/feedback/processar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laudo_id: selectedLaudo.db_id,
          correcao: inlineFeedbackText
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Erro ao processar feedback');
      }
      
      const result: FeedbackResponse = await res.json();
      console.log('[Feedback] Resposta da API:', result);
      
      // Atualizar laudo com nova análise e marcar como corrigido
      const corrigidoEm = new Date().toISOString();
      console.log('[Feedback] Atualizando laudo com corrigido_em:', corrigidoEm);
      
      setSelectedLaudo(prev => prev ? {
        ...prev,
        analise: result.nova_analise ? result.nova_analise as any : prev.analise,
        recebeu_feedback: true,
        corrigido_em: corrigidoEm
      } : null);
      
      // Atualizar na lista de laudos também
      setLaudos(prev => prev.map(l => 
        l.id === selectedLaudo.id 
          ? { 
              ...l, 
              analise: result.nova_analise ? result.nova_analise as any : l.analise, 
              recebeu_feedback: true, 
              corrigido_em: corrigidoEm 
            }
          : l
      ));
      
      await new Promise(r => setTimeout(r, 1000));
      
      // Etapa 3: Agradecimento
      setInlineFeedbackStatus('agradecimento');
      console.log('[Feedback] Processamento concluído!');
      
      // Marcar como corrigido
      setLaudosCorrigidos(prev => {
        const newSet = new Set(prev);
        newSet.add(selectedLaudo.id);
        return newSet;
      });
      
      // Recarregar dados do servidor
      await loadData();
      
    } catch (error) {
      console.error('[Feedback] Erro:', error);
      setFeedbackError(error instanceof Error ? error.message : 'Erro desconhecido');
      setInlineFeedbackStatus('idle');
    }
  };
  
  // Função para reanalisar laudo com novo conhecimento
  const reanalisarLaudo = async (laudoId: string) => {
    try {
      // Recarregar dados do servidor para pegar análise atualizada
      await loadData();
      
      // Atualizar laudo selecionado se ainda estiver aberto
      if (selectedLaudo?.id === laudoId) {
        const res = await fetch(`${API_URL}/laudos/${laudoId}`);
        if (res.ok) {
          const updatedLaudo = await res.json();
          setSelectedLaudo(updatedLaudo);
        }
      }
    } catch (error) {
      console.error('Erro ao reanalisar:', error);
    }
  };

  const openLaudoDetails = async (laudo: LaudoProcessado) => {
    try {
      const res = await fetch(`${API_URL}/laudos/${laudo.id}`);
      if (res.ok) {
        const fullLaudo = await res.json();
        setSelectedLaudo(fullLaudo);
        setEditForm({
          nome: fullLaudo.analise?.paciente?.nome || '',
          idade: fullLaudo.analise?.paciente?.idade || '',
          sexo: fullLaudo.analise?.paciente?.sexo || '',
          data_exame: fullLaudo.analise?.paciente?.data_exame || '',
          gravidade: fullLaudo.analise?.gravidade || '',
          area_valvar: fullLaudo.analise?.area_valvar || '',
          gradiente_medio: fullLaudo.analise?.gradiente_medio || '',
          velocidade_maxima: fullLaudo.analise?.velocidade_maxima || '',
          prioridade: fullLaudo.analise?.prioridade || '',
          indicacao_tavi: fullLaudo.analise?.indicacao_tavi || false,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar laudo:', error);
    }
  };

  const saveEdit = async (campo: string, valor: any) => {
    if (!selectedLaudo) return;
    try {
      const res = await fetch(`${API_URL}/editar-laudo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ laudo_id: selectedLaudo.id, campo, valor })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedLaudo(data.laudo);
        setLaudos(prev => prev.map(l => l.id === selectedLaudo.id ? data.laudo : l));
        loadData();
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  const getFileIcon = (formato: string) => {
    switch (formato) {
      case 'pdf': return <FileText className="w-4 h-4" />;
      case 'imagem': return <Image className="w-4 h-4" />;
      default: return <File className="w-4 h-4" />;
    }
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'alta': return 'bg-red-500';
      case 'media': return 'bg-amber-500';
      case 'baixa': return 'bg-emerald-500';
      default: return 'bg-slate-500';
    }
  };

  const getPrioridadeBg = (prioridade: string) => {
    switch (prioridade) {
      case 'alta': return 'bg-red-50 border-red-200';
      case 'media': return 'bg-amber-50 border-amber-200';
      case 'baixa': return 'bg-emerald-50 border-emerald-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  // Filtrar e ordenar laudos (mais recentes primeiro)
  const filteredLaudos = laudos
    .filter(laudo => {
      const nomePaciente = laudo.analise.paciente?.nome?.toLowerCase() || '';
      const matchSearch = !searchTerm || nomePaciente.includes(searchTerm.toLowerCase());
      const matchPrioridade = !filterPrioridade || laudo.analise.prioridade === filterPrioridade;
      const matchEncaminhado = filterEncaminhado === '' || 
        (filterEncaminhado === 'sim' && laudo.encaminhado) ||
        (filterEncaminhado === 'nao' && !laudo.encaminhado);
      return matchSearch && matchPrioridade && matchEncaminhado;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  // Paginação
  const totalPages = Math.ceil(filteredLaudos.length / LAUDOS_PER_PAGE);
  const paginatedLaudos = filteredLaudos.slice((currentPage - 1) * LAUDOS_PER_PAGE, currentPage * LAUDOS_PER_PAGE);

  // HOME / LANDING PAGE
  if (view === 'home') {
    return (
      <div className="min-h-screen bg-[#0a1628] relative overflow-hidden">
        {/* Neural Network Background */}
        <div className="absolute inset-0">
          {/* Gradient base */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d1f3c] to-[#0a1628]"></div>
          
          {/* Animated dots/nodes */}
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.3) 1px, transparent 0)`,
            backgroundSize: '50px 50px'
          }}></div>
          
          {/* Glowing orbs */}
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
          <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
          
          {/* Network lines effect */}
          <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="network" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                <circle cx="50" cy="50" r="1" fill="#3b82f6"/>
                <line x1="50" y1="50" x2="100" y2="0" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5"/>
                <line x1="50" y1="50" x2="0" y2="100" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5"/>
                <line x1="50" y1="50" x2="100" y2="100" stroke="#3b82f6" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#network)"/>
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10">
          {/* Header */}
          <header className="bg-white sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-20">
                <img src="/logo.png" alt="CardioScreen" className="h-14 w-auto" />
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-4 py-2 text-slate-700 font-medium hover:text-blue-600 transition-colors hidden sm:block"
                  >
                    Como Funciona
                  </button>
                  <button
                    onClick={() => setView('upload')}
                    className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors"
                  >
                    Acessar Sistema
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Hero Section */}
          <section className="py-12 sm:py-16 lg:py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 backdrop-blur-sm rounded-full mb-6 border border-blue-500/30">
                  <Heart className="w-4 h-4 text-red-400" />
                  <span className="text-blue-400 font-medium text-sm">Triagem Inteligente com IA</span>
                </div>
                
                <div className="flex items-center gap-6 mb-6">
                  <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight">
                    <span className="sm:whitespace-nowrap">Análise Automatizada de</span><br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 sm:whitespace-nowrap">
                      Laudos de Ecocardiograma
                    </span>
                  </h1>
                  <svg className="hidden sm:block w-24 h-24 lg:w-32 lg:h-32 text-cyan-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                  </svg>
                </div>
                
                <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mb-10 leading-relaxed">
                  Identifique automaticamente pacientes com estenose aórtica candidatos a TAVI usando inteligência artificial avançada
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={() => setView('upload')}
                    className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
                  >
                    Começar Análise
                  </button>
                  <button
                    onClick={() => setView('dashboard')}
                    className="px-8 py-4 bg-transparent text-white font-semibold rounded-xl hover:bg-white/5 transition-all border border-white/30 flex items-center justify-center gap-2"
                  >
                    Ver Dashboard
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section id="como-funciona" className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-4">Como Funciona</h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                Sistema completo para triagem automatizada de estenose aórtica
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-blue-500/50 transition-colors">
                <div className="w-14 h-14 bg-blue-500/20 rounded-xl flex items-center justify-center mb-6">
                  <Upload className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Upload Múltiplo</h3>
                <p className="text-slate-400">
                  Carregue múltiplos laudos de uma vez. Suporta PDF, imagens e arquivos de texto.
                </p>
              </div>
              
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-cyan-500/50 transition-colors">
                <div className="w-14 h-14 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-6">
                  <Zap className="w-7 h-7 text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Análise com IA</h3>
                <p className="text-slate-400">
                  Claude Haiku analisa cada laudo e identifica estenose aórtica com alta precisão.
                </p>
              </div>
              
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-emerald-500/50 transition-colors">
                <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Dashboard Completo</h3>
                <p className="text-slate-400">
                  Acompanhe estatísticas, gerencie encaminhamentos e filtre por período.
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-white/10 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <img src="/logo.png" alt="CardioScreen" className="h-12 w-auto mx-auto mb-4 opacity-50" />
              <p className="text-sm text-slate-500">
                Powered by Claude Haiku • Anthropic AI
              </p>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  // MAIN APP WITH SIDEBAR
  return (
    <div className="min-h-screen bg-[#0a1628] flex relative">
      {/* Background pattern - identical to landing page */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#0d1f3c] to-[#0a1628]"></div>
        <div className="absolute inset-0" style={{backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.3) 1px, transparent 0)`, backgroundSize: '50px 50px'}}></div>
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 left-1/3 w-64 h-64 bg-cyan-500/15 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 right-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
        <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="network2" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="1" fill="#3b82f6"/>
              <line x1="50" y1="50" x2="100" y2="0" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5"/>
              <line x1="50" y1="50" x2="0" y2="100" stroke="#3b82f6" strokeWidth="0.5" opacity="0.5"/>
              <line x1="50" y1="50" x2="100" y2="100" stroke="#3b82f6" strokeWidth="0.5" opacity="0.3"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#network2)"/>
        </svg>
      </div>
      
      {/* Sidebar Desktop */}
      <aside className={`hidden lg:flex flex-col bg-white/95 backdrop-blur-md border-r border-white/20 transition-all duration-300 z-10 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="p-6">
          <div className="flex justify-center">
            <img src="/logo.png" alt="CardioScreen" className="w-auto transition-all" style={{maxWidth: sidebarOpen ? '100%' : '48px', height: 'auto'}} />
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setView('home')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-slate-600 hover:bg-slate-100"
          >
            <Home className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Início</span>}
          </button>
          
          <button
            onClick={() => { setView('upload'); setLaudos([]); setUploadFiles([]); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              view === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Upload className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Upload</span>}
          </button>
          
          <button
            onClick={() => setView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
              view === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="font-medium">Dashboard</span>}
          </button>
          
        </nav>
        
        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <ChevronLeft className={`w-5 h-5 transition-transform ${!sidebarOpen ? 'rotate-180' : ''}`} />
            {sidebarOpen && <span className="text-sm">Recolher</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-white/20">
        <div className="flex items-center justify-between px-4 h-16">
          <img src="/logo.png" alt="CardioScreen" className="h-8 w-auto" />
          <button
            onClick={() => setSidebarMobileOpen(!sidebarMobileOpen)}
            className="p-2 rounded-lg hover:bg-slate-100"
          >
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </div>
        
        {sidebarMobileOpen && (
          <div className="bg-white/95 backdrop-blur-md border-t border-slate-100 py-2">
            <button
              onClick={() => { setView('home'); setSidebarMobileOpen(false); }}
              className="w-full flex items-center gap-3 px-6 py-3 text-slate-600"
            >
              <Home className="w-5 h-5" />
              <span className="font-medium">Início</span>
            </button>
            <button
              onClick={() => { setView('upload'); setLaudos([]); setUploadFiles([]); setSidebarMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-6 py-3 ${view === 'upload' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'}`}
            >
              <Upload className="w-5 h-5" />
              <span className="font-medium">Upload</span>
            </button>
            <button
              onClick={() => { setView('dashboard'); setSidebarMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-6 py-3 ${view === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'text-slate-600'}`}
            >
              <BarChart3 className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <main className="flex-1 lg:pt-0 pt-16 z-10 relative overflow-x-hidden">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          
          {/* API Error Alert */}
          {apiError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Erro de Conexão</p>
                <p className="text-sm text-red-600">{apiError}</p>
              </div>
              <button onClick={() => setApiError(null)} className="ml-auto">
                <X className="w-5 h-5 text-red-400" />
              </button>
            </div>
          )}

          {/* UPLOAD VIEW */}
          {view === 'upload' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">Upload de Laudos</h1>
              </div>

              <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
                <div className="p-6">
                  <div 
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl transition-all ${
                      dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400'
                    }`}
                  >
                    <input
                      type="file"
                      multiple
                      accept={FORMATOS_ACEITOS}
                      onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer block p-10 text-center">
                      <div className={`inline-flex p-4 rounded-full mb-4 ${dragActive ? 'bg-blue-100' : 'bg-slate-50'}`}>
                        <Upload className={`w-10 h-10 ${dragActive ? 'text-blue-600' : 'text-slate-500'}`} />
                      </div>
                      <p className="text-lg font-medium text-slate-800">
                        {dragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique para selecionar'}
                      </p>
                      <p className="text-sm text-slate-500 mt-2">PDF, imagens (PNG, JPG) e TXT</p>
                    </label>
                  </div>

                  {uploadFiles.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {(uploadFiles.some(f => f.status === 'uploading') || (isProcessing && uploadFiles.some(f => f.status === 'pending'))) && (
                        <div className="relative py-4 px-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg">
                              {/* Content */}
                              <div className="flex items-center justify-center gap-3 text-blue-600">
                                <Activity className="w-5 h-5 ecg-draw" />
                                <span className="text-sm font-medium">
                                  Processando com IA ({Math.min(uploadFiles.filter(f => f.status === 'success' || f.status === 'error').length + 1, uploadFiles.length)} / {uploadFiles.length})
                                </span>
                              </div>
                            </div>
                          )}
                      
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{uploadFiles.length} arquivo{uploadFiles.length > 1 ? 's' : ''}</span>
                        <button onClick={clearCompleted} className="text-slate-500 hover:text-slate-700">Limpar</button>
                      </div>
                      
                      <div 
                        ref={fileListRef} 
                        className="space-y-1 max-h-60 overflow-y-auto scroll-smooth"
                        onMouseDown={() => { userScrollingRef.current = true; }}
                        onMouseUp={() => {
                          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                          scrollTimeoutRef.current = setTimeout(() => { userScrollingRef.current = false; }, 2000);
                        }}
                        onWheel={() => {
                          userScrollingRef.current = true;
                          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
                          scrollTimeoutRef.current = setTimeout(() => { userScrollingRef.current = false; }, 2000);
                        }}
                      >
                        {uploadFiles.map((item, index) => (
                          <div 
                            key={index} 
                            className="flex items-center gap-2 py-1"
                          >
                            <div className={`w-1 h-6 rounded-full ${
                              item.status === 'success' ? 'bg-emerald-500' :
                              item.status === 'error' ? 'bg-red-500' :
                              item.status === 'uploading' ? 'bg-blue-500 animate-pulse' :
                              'bg-slate-300'
                            }`} />
                            <span 
                              className={`flex-1 text-sm text-slate-700 truncate ${(item.file.type.includes('image') || item.file.type === 'application/pdf') ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                              onClick={() => {
                                if (item.file.type.includes('image') || item.file.type === 'application/pdf') {
                                  const url = URL.createObjectURL(item.file);
                                  window.open(url, '_blank');
                                }
                              }}
                              title={item.file.type.includes('image') || item.file.type === 'application/pdf' ? 'Clique para abrir' : undefined}
                            >
                              {item.file.name}
                            </span>
                            {item.status === 'success' && item.result && (
                              <>
                                {item.result.analise.indicacao_tavi && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white bg-purple-600">
                                    TAVI
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${getPrioridadeColor(item.result.analise.prioridade)}`}>
                                  {item.result.analise.prioridade.toUpperCase()}
                                </span>
                              </>
                            )}
                            {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                            {item.status === 'uploading' && (
                              <svg className="w-5 h-5" viewBox="0 0 36 36">
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="#e2e8f0"
                                  strokeWidth="3"
                                />
                                <path
                                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth="3"
                                  strokeDasharray={`${item.progress}, 100`}
                                  strokeLinecap="round"
                                  style={{transform: 'rotate(-90deg)', transformOrigin: 'center'}}
                                />
                              </svg>
                            )}
                            {item.status === 'pending' && (
                              <button onClick={() => removeFile(index)} className="p-0.5 hover:bg-slate-200 rounded">
                                <X className="w-3 h-3 text-slate-400" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Results */}
              {sessionLaudos.length > 0 && (
                <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
                  <div className="p-4 sm:p-6 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">Resultados ({sessionLaudos.length})</h2>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50 hidden sm:table-header-group">
                        <tr>
                          <th className="w-1"></th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Paciente</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Upload</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Exame</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Prioridade</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Gravidade</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">TAVI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sessionLaudos.map((laudo) => (
                          <tr key={laudo.id} className="hover:bg-slate-50">
                            <td className={`w-1 ${getPrioridadeColor(laudo.analise.prioridade)}`}></td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-slate-800">
                                  {laudo.analise.paciente?.nome || laudo.arquivo}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {laudo.analise.paciente?.idade ? `${laudo.analise.paciente.idade} anos` : ''}
                                  {laudo.analise.paciente?.sexo ? ` • ${laudo.analise.paciente.sexo === 'M' ? 'Masculino' : 'Feminino'}` : ''}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-500">{new Date(laudo.timestamp).toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{laudo.analise.paciente?.data_exame || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getPrioridadeColor(laudo.analise.prioridade)}`}>
                                {laudo.analise.prioridade.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-700">{laudo.analise.gravidade}</td>
                            <td className="px-4 py-3">
                              {laudo.analise.indicacao_tavi ? (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">SIM</span>
                              ) : <span className="text-slate-400">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DASHBOARD VIEW */}
          {view === 'dashboard' && (
            <div className="space-y-6">
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>

              {/* Period Filter */}
              <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-slate-400" />
                    <span className="font-medium text-slate-700">Período:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['dia', 'semana', 'mes', 'todos', 'custom'] as Periodo[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPeriodo(p)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          periodo === p ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {p === 'dia' ? 'Hoje' : p === 'semana' ? 'Semana' : p === 'mes' ? 'Mês' : p === 'todos' ? 'Todos' : 'Personalizado'}
                      </button>
                    ))}
                  </div>
                  {periodo === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <input type="date" value={customDateStart} onChange={(e) => setCustomDateStart(e.target.value)} className="flex-1 sm:flex-none px-3 py-1.5 border border-slate-300 rounded-lg text-sm min-w-0" />
                      <span className="text-slate-400">até</span>
                      <input type="date" value={customDateEnd} onChange={(e) => setCustomDateEnd(e.target.value)} className="flex-1 sm:flex-none px-3 py-1.5 border border-slate-300 rounded-lg text-sm min-w-0" />
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-100 rounded-xl">
                        <Activity className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-800">{stats.total_laudos}</p>
                        <p className="text-sm text-slate-500">Total</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-red-100 rounded-xl">
                        <Heart className="w-6 h-6 text-red-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{stats.indicacao_tavi}</p>
                        <p className="text-sm text-slate-500">TAVI</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-emerald-100 rounded-xl">
                        <Send className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-emerald-600">{stats.encaminhados}</p>
                        <p className="text-sm text-slate-500">Encaminhados</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-5">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-amber-100 rounded-xl">
                        <Clock className="w-6 h-6 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{stats.total_laudos - stats.encaminhados}</p>
                        <p className="text-sm text-slate-500">Pendentes</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts */}
              {stats && (
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6">
                    <h3 className="font-bold text-slate-800 mb-4">Por Prioridade</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Alta', value: stats.prioridade_alta, color: 'bg-red-500', textColor: 'text-red-600' },
                        { label: 'Média', value: stats.prioridade_media, color: 'bg-amber-500', textColor: 'text-amber-600' },
                        { label: 'Baixa', value: stats.prioridade_baixa, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-600">{item.label}</span>
                            <span className={`font-medium ${item.textColor}`}>{item.value}</span>
                          </div>
                          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${item.color} rounded-full`} style={{ width: `${stats.total_laudos ? (item.value / stats.total_laudos) * 100 : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6">
                    <h3 className="font-bold text-slate-800 mb-4">Por Gravidade</h3>
                    <div className="space-y-3">
                      {stats.por_gravidade && Object.entries(stats.por_gravidade).map(([gravidade, count]) => (
                        <div key={gravidade} className="flex items-center justify-between">
                          <span className="text-slate-600 capitalize">{gravidade}</span>
                          <span className="px-3 py-1 bg-slate-100 rounded-full text-sm font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Lista de Laudos com Busca e Filtros */}
              <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        placeholder="Buscar por nome do paciente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <select
                        value={filterPrioridade}
                        onChange={(e) => setFilterPrioridade(e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-0"
                      >
                        <option value="">Prioridade</option>
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                      <select
                        value={filterEncaminhado}
                        onChange={(e) => setFilterEncaminhado(e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-lg text-sm min-w-0"
                      >
                        <option value="">Status</option>
                        <option value="sim">Encaminhados</option>
                        <option value="nao">Pendentes</option>
                      </select>
                      {!selectionMode && (
                        <button
                          onClick={() => setSelectionMode(true)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-1"
                          title="Selecionar múltiplos"
                        >
                          <Check className="w-4 h-4" />
                          Selecionar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Barra de ações para seleção múltipla */}
                {selectionMode && view === 'dashboard' && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-blue-700">
                        {selectedLaudos.size} laudo(s) selecionado(s)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => deleteSelectedItems('laudo')}
                        disabled={selectedLaudos.size === 0}
                        className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        Deletar Selecionados
                      </button>
                      <button
                        onClick={() => { setSelectionMode(false); setSelectedLaudos(new Set()); }}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 hidden sm:table-header-group">
                      <tr>
                        {selectionMode && (
                          <th className="px-2 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={selectedLaudos.size === paginatedLaudos.length && paginatedLaudos.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedLaudos(new Set(paginatedLaudos.map(l => l.id)));
                                } else {
                                  setSelectedLaudos(new Set());
                                }
                              }}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                          </th>
                        )}
                        <th className="w-1"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Paciente</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Upload</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Exame</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Prioridade</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Gravidade</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">TAVI</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedLaudos.length === 0 ? (
                        <tr><td colSpan={8} className="p-8 text-center text-slate-500">Nenhum laudo encontrado</td></tr>
                      ) : (
                        paginatedLaudos.map((laudo) => (
                          <tr key={laudo.id} className={`hover:bg-slate-50 ${selectedLaudos.has(laudo.id) ? 'bg-blue-50' : ''}`}>
                            {selectionMode && (
                              <td className="px-2 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedLaudos.has(laudo.id)}
                                  onChange={() => toggleLaudoSelection(laudo.id)}
                                  className="w-4 h-4 rounded border-slate-300"
                                />
                              </td>
                            )}
                            <td className={`w-1 ${getPrioridadeColor(laudo.analise.prioridade)}`}></td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-slate-800">{laudo.analise.paciente?.nome || laudo.arquivo}</p>
                                  {laudo.editado_manualmente && (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs" title="Editado manualmente">
                                      <Edit3 className="w-3 h-3 inline" />
                                    </span>
                                  )}
                                  {laudo.recebeu_feedback && (
                                    <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs" title="Recebeu feedback médico">
                                      <CheckCircle className="w-3 h-3 inline" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">
                                  {laudo.analise.paciente?.idade ? `${laudo.analise.paciente.idade} anos` : ''}
                                  {laudo.analise.paciente?.sexo ? ` • ${laudo.analise.paciente.sexo === 'M' ? 'Masculino' : 'Feminino'}` : ''}
                                </p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-500">{new Date(laudo.timestamp).toLocaleDateString('pt-BR')}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{laudo.analise.paciente?.data_exame || '-'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getPrioridadeColor(laudo.analise.prioridade)}`}>
                                {laudo.analise.prioridade.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-3 capitalize text-slate-700">{laudo.analise.gravidade}</td>
                            <td className="px-4 py-3">
                              {laudo.analise.indicacao_tavi ? (
                                <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">SIM</span>
                              ) : <span className="text-slate-400">-</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openLaudoDetails(laudo)}
                                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                  title="Ver detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => toggleEncaminhado(laudo.id, !laudo.encaminhado)}
                                  className={`p-2 rounded-lg transition-colors ${
                                    laudo.encaminhado ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500'
                                  }`}
                                  title={laudo.encaminhado ? 'Encaminhado' : 'Marcar como encaminhado'}
                                >
                                  {laudo.encaminhado ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => openDeleteModal('laudo', laudo.id, laudo.analise.paciente?.nome || laudo.arquivo)}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                  title="Deletar laudo"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Mostrando {((currentPage - 1) * LAUDOS_PER_PAGE) + 1}-{Math.min(currentPage * LAUDOS_PER_PAGE, filteredLaudos.length)} de {filteredLaudos.length} laudos
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <span className="text-sm text-slate-600">Página {currentPage} de {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* View: Lessons */}
          {view === 'lessons' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-800">Lessons Learned</h1>
                  <p className="text-slate-500">Conhecimento adquirido através de correções médicas</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{lessons.length} lessons</span>
                </div>
              </div>

              {/* Tabela de Lessons */}
              <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="w-1"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Regra</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Categoria</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Criada em</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lessons.length === 0 ? (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-500">Nenhuma lesson encontrada</td></tr>
                      ) : (
                        lessons.map((lesson) => (
                          <tr key={lesson.id} className="hover:bg-slate-50">
                            <td className={`w-1 ${lesson.ativa !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}></td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-800">#{lesson.id}</td>
                            <td className="px-4 py-3">
                              <p className="text-slate-800 truncate max-w-md" title={lesson.regra}>
                                {lesson.regra.length > 50 ? lesson.regra.substring(0, 50) + '...' : lesson.regra}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                {lesson.categoria || 'Geral'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-500">
                              {lesson.created_at ? new Date(lesson.created_at).toLocaleDateString('pt-BR') : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => loadLessonDetails(lesson.id)}
                                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                  title="Ver detalhes"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => openDeleteModal('lesson', lesson.id, `Lesson #${lesson.id}`)}
                                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                  title="Deletar lesson"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal de Detalhes/Edição */}
      {selectedLaudo && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" 
          onClick={() => { 
            setSelectedLaudo(null); 
            setIsEditing(false); 
            setShowFeedbackForm(false);
            setInlineFeedbackText('');
            setInlineFeedbackStatus('idle');
          }}
          onKeyDown={(e) => { 
            if (e.key === 'Escape') { 
              setSelectedLaudo(null); 
              setIsEditing(false); 
              setShowFeedbackForm(false);
              setInlineFeedbackText('');
              setInlineFeedbackStatus('idle');
            } 
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${getPrioridadeColor(selectedLaudo.analise.prioridade)}`}>
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedLaudo.arquivo}</h2>
                  <div className="text-sm text-slate-500 space-y-0.5">
                    <p>Carregado em {new Date(selectedLaudo.timestamp).toLocaleString('pt-BR')}</p>
                    {selectedLaudo.editado_em && (
                      <p className="text-amber-600">Editado em {new Date(selectedLaudo.editado_em).toLocaleString('pt-BR')}</p>
                    )}
                    {selectedLaudo.corrigido_em && (
                      <p className="text-green-600">Corrigido em {new Date(selectedLaudo.corrigido_em).toLocaleString('pt-BR')}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedLaudo.editado_manualmente && (
                  <div 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium border border-amber-200"
                    title={`Campos editados: ${selectedLaudo.campos_editados?.join(', ') || 'N/A'}`}
                  >
                    <Edit3 className="w-4 h-4" />
                    Editado
                  </div>
                )}
                {(selectedLaudo.recebeu_feedback || laudosCorrigidos.has(selectedLaudo.id)) && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium border border-green-200">
                    <CheckCircle className="w-4 h-4" />
                    Corrigido
                  </div>
                )}
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${isEditing ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'}`}
                >
                  <Edit3 className="w-4 h-4" />
                  {isEditing ? 'Editando' : 'Editar'}
                </button>
                <button onClick={() => { 
                  setSelectedLaudo(null); 
                  setIsEditing(false);
                  setShowFeedbackForm(false);
                  setInlineFeedbackText('');
                  setInlineFeedbackStatus('idle');
                }} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-180px)]">
              {/* Dados do Paciente */}
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <User className="w-5 h-5 text-slate-400" />
                  Dados do Paciente
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Nome</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.nome || ''}
                        onChange={(e) => setEditForm({...editForm, nome: e.target.value})}
                        onBlur={() => saveEdit('nome', editForm.nome || null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="Nome do paciente"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.paciente?.nome || <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Idade</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editForm.idade || ''}
                        onChange={(e) => setEditForm({...editForm, idade: e.target.value})}
                        onBlur={() => saveEdit('idade', editForm.idade ? parseInt(editForm.idade) : null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="Idade"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.paciente?.idade ? `${selectedLaudo.analise.paciente.idade} anos` : <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Sexo</label>
                    {isEditing ? (
                      <select
                        value={editForm.sexo || ''}
                        onChange={(e) => { setEditForm({...editForm, sexo: e.target.value}); saveEdit('sexo', e.target.value || null); }}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="">Selecione</option>
                        <option value="M">Masculino</option>
                        <option value="F">Feminino</option>
                      </select>
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.paciente?.sexo === 'M' ? 'Masculino' : selectedLaudo.analise.paciente?.sexo === 'F' ? 'Feminino' : <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Data do Exame</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editForm.data_exame || ''}
                        onChange={(e) => setEditForm({...editForm, data_exame: e.target.value})}
                        onBlur={() => saveEdit('data_exame', editForm.data_exame || null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        placeholder="DD/MM/AAAA"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.paciente?.data_exame || <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Análise */}
              <div className="p-6 border-b border-slate-100">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-slate-400" />
                  Análise Clínica
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Prioridade</label>
                    {isEditing ? (
                      <select
                        value={editForm.prioridade || ''}
                        onChange={(e) => { setEditForm({...editForm, prioridade: e.target.value}); saveEdit('prioridade', e.target.value); }}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                    ) : (
                      <p className="mt-1"><span className={`px-2 py-1 rounded text-xs font-bold text-white ${getPrioridadeColor(selectedLaudo.analise.prioridade)}`}>{selectedLaudo.analise.prioridade.toUpperCase()}</span></p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Gravidade</label>
                    {isEditing ? (
                      <select
                        value={editForm.gravidade || ''}
                        onChange={(e) => { setEditForm({...editForm, gravidade: e.target.value}); saveEdit('gravidade', e.target.value); }}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="ausente">Ausente</option>
                        <option value="leve">Leve</option>
                        <option value="moderada">Moderada</option>
                        <option value="importante">Importante</option>
                        <option value="grave">Grave</option>
                      </select>
                    ) : (
                      <p className="font-medium text-slate-800 mt-1 capitalize">{selectedLaudo.analise.gravidade || <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Área Valvar (cm²)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.area_valvar || ''}
                        onChange={(e) => setEditForm({...editForm, area_valvar: e.target.value})}
                        onBlur={() => saveEdit('area_valvar', editForm.area_valvar ? parseFloat(editForm.area_valvar) : null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.area_valvar ?? <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Gradiente (mmHg)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        value={editForm.gradiente_medio || ''}
                        onChange={(e) => setEditForm({...editForm, gradiente_medio: e.target.value})}
                        onBlur={() => saveEdit('gradiente_medio', editForm.gradiente_medio ? parseFloat(editForm.gradiente_medio) : null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.gradiente_medio ?? <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Velocidade (m/s)</label>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editForm.velocidade_maxima || ''}
                        onChange={(e) => setEditForm({...editForm, velocidade_maxima: e.target.value})}
                        onBlur={() => saveEdit('velocidade_maxima', editForm.velocidade_maxima ? parseFloat(editForm.velocidade_maxima) : null)}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="font-medium text-slate-800 mt-1">{selectedLaudo.analise.velocidade_maxima ?? <span className="text-amber-500 italic">Indefinido</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Indicação TAVI</label>
                    {isEditing ? (
                      <select
                        value={editForm.indicacao_tavi ? 'true' : 'false'}
                        onChange={(e) => { const val = e.target.value === 'true'; setEditForm({...editForm, indicacao_tavi: val}); saveEdit('indicacao_tavi', val); }}
                        className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      >
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </select>
                    ) : (
                      <p className="mt-1">{selectedLaudo.analise.indicacao_tavi ? <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">SIM</span> : <span className="text-slate-400">Não</span>}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 uppercase">Confiança IA</label>
                    <p className="font-medium text-slate-800 mt-1">{(selectedLaudo.analise.confianca * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="text-xs text-slate-500 uppercase">Justificativa</label>
                  <p className="text-slate-700 mt-1 bg-slate-50 p-3 rounded-lg">{selectedLaudo.analise.justificativa}</p>
                  
                  {/* Link discreto SEMPRE presente */}
                  <div className="mt-2">
                    <button
                      onClick={() => {
                        if (showFeedbackForm) {
                          // Fechando - resetar tudo
                          setShowFeedbackForm(false);
                          setInlineFeedbackText('');
                          setInlineFeedbackStatus('idle');
                          setFeedbackError(null);
                        } else {
                          // Abrindo - garantir estado limpo
                          setInlineFeedbackText('');
                          setInlineFeedbackStatus('idle');
                          setFeedbackError(null);
                          setShowFeedbackForm(true);
                        }
                      }}
                      className="text-xs text-slate-500 hover:text-blue-600 underline transition-colors"
                      disabled={!selectedLaudo.db_id}
                      title={!selectedLaudo.db_id ? 'Laudo não salvo no banco de dados' : 'Enviar correção para melhorar a IA'}
                    >
                      Corrigir Análise
                    </button>
                  </div>
                  
                  {/* Formulário Inline de Correção */}
                  {showFeedbackForm && (
                    <div className={`mt-4 p-4 rounded-lg border transition-colors duration-300 feedback-form-enter ${
                      inlineFeedbackStatus === 'idle' ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200'
                    }`}>
                      {inlineFeedbackStatus === 'idle' ? (
                        <>
                          <p className="text-sm text-slate-600 mb-3">
                            Descreva o que estava errado na análise:
                          </p>
                          <textarea
                            value={inlineFeedbackText}
                            onChange={(e) => setInlineFeedbackText(e.target.value)}
                            placeholder="Ex: A gravidade deveria ser 'importante' porque o gradiente médio é 45mmHg..."
                            className="w-full h-24 px-3 py-2 border border-yellow-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            autoFocus
                          />
                          {feedbackError && (
                            <p className="mt-2 text-xs text-red-600">{feedbackError}</p>
                          )}
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setShowFeedbackForm(false);
                                setInlineFeedbackText('');
                                setFeedbackError(null);
                              }}
                              className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={processInlineFeedback}
                              disabled={!inlineFeedbackText.trim()}
                              className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded-lg font-medium hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Enviar Correção
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-4">
                          <div className="flex items-center justify-center gap-3">
                            {inlineFeedbackStatus === 'revisando' && (
                              <>
                                <Search className="w-5 h-5 animate-pulse text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-700 feedback-status-text">
                                  Revisando comentário...
                                </span>
                              </>
                            )}
                            {inlineFeedbackStatus === 'aprendendo' && (
                              <div className="flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-blue-600" />
                                <Zap className="w-5 h-5 text-yellow-500 animate-pulse" />
                                <Brain className="w-5 h-5 text-blue-600" />
                                <span className="text-sm font-medium text-blue-700">
                                  Aprendendo com o caso...
                                </span>
                              </div>
                            )}
                            {inlineFeedbackStatus === 'agradecimento' && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-green-700">
                                  Inteligência aprimorada! Muito obrigado pelo feedback!
                                </span>
                                <Smile className="w-5 h-5 text-green-600" />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Texto Original */}
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    Documento Original
                    {selectedLaudo.formato === 'imagem' && (
                      <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">Imagem</span>
                    )}
                    {selectedLaudo.formato === 'pdf' && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">PDF</span>
                    )}
                  </h3>
                  <button
                    onClick={() => window.open(`${API_URL}/arquivo/${selectedLaudo.id}`, '_blank')}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    Abrir Arquivo
                  </button>
                </div>
                {selectedLaudo.formato === 'imagem' ? (
                  <div 
                    className="bg-slate-100 rounded-lg p-4 flex justify-center cursor-pointer hover:bg-slate-200 transition-colors"
                    onClick={() => { setImageViewerOpen(true); setImageZoom(1); setImagePan({ x: 0, y: 0 }); }}
                  >
                    <img 
                      src={`${API_URL}/arquivo/${selectedLaudo.id}`} 
                      alt="Documento original"
                      className="max-h-64 rounded shadow-sm"
                    />
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                    {selectedLaudo.texto_original ? (
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{selectedLaudo.texto_original}</pre>
                    ) : (
                      <p className="text-slate-500 italic">Texto original não disponível para este tipo de documento.</p>
                    )}
                  </div>
                )}
                {selectedLaudo.formato === 'imagem' && (
                  <p className="text-xs text-slate-500 mt-2 text-center">Clique na imagem para ampliar</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-between">
              <button
                onClick={() => openDeleteModal('laudo', selectedLaudo.id, selectedLaudo.analise.paciente?.nome || selectedLaudo.arquivo)}
                className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
                Deletar Laudo
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleEncaminhado(selectedLaudo.id, !selectedLaudo.encaminhado)}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${selectedLaudo.encaminhado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {selectedLaudo.encaminhado ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {selectedLaudo.encaminhado ? 'Encaminhado' : 'Marcar Encaminhado'}
                </button>
                <button onClick={() => { 
                  setSelectedLaudo(null); 
                  setIsEditing(false);
                  setShowFeedbackForm(false);
                  setInlineFeedbackText('');
                  setInlineFeedbackStatus('idle');
                }} className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização de Imagem Fullscreen */}
      {imageViewerOpen && selectedLaudo && selectedLaudo.formato === 'imagem' && (
        <div 
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center"
          onClick={() => setImageViewerOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setImageViewerOpen(false); }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          {/* Controles */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); setImageZoom(z => Math.max(0.5, z - 0.25)); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
              title="Diminuir zoom"
            >
              <span className="text-xl font-bold">−</span>
            </button>
            <span className="text-white text-sm min-w-[60px] text-center">{Math.round(imageZoom * 100)}%</span>
            <button
              onClick={(e) => { e.stopPropagation(); setImageZoom(z => Math.min(5, z + 0.25)); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
              title="Aumentar zoom"
            >
              <span className="text-xl font-bold">+</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setImageZoom(1); setImagePan({ x: 0, y: 0 }); }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm"
              title="Resetar"
            >
              Reset
            </button>
            <button
              onClick={() => setImageViewerOpen(false)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white ml-4"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Imagem com zoom e pan */}
          <div 
            className="overflow-hidden cursor-grab active:cursor-grabbing"
            style={{ width: '90vw', height: '90vh' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDragging(true);
              setDragStart({ x: e.clientX - imagePan.x, y: e.clientY - imagePan.y });
            }}
            onMouseMove={(e) => {
              if (isDragging) {
                setImagePan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setImageZoom(z => Math.max(0.5, Math.min(5, z + delta)));
            }}
          >
            <img 
              src={`${API_URL}/arquivo/${selectedLaudo.id}`}
              alt="Documento original"
              className="max-w-none select-none"
              style={{
                transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${imageZoom})`,
                transformOrigin: 'center center',
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
              draggable={false}
            />
          </div>
          
          {/* Instruções */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Scroll para zoom • Arraste para mover • Clique fora para fechar
          </div>
        </div>
      )}

      {/* Modal de Feedback/Correção */}
      {feedbackLaudo && (
        <div 
          className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4"
          onClick={() => feedbackStatus === 'idle' && closeFeedbackModal()}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Corrigir Análise</h2>
                    <p className="text-sm text-slate-500">{feedbackLaudo.arquivo}</p>
                  </div>
                </div>
                {feedbackStatus === 'idle' && (
                  <button onClick={closeFeedbackModal} className="p-2 hover:bg-white/50 rounded-lg">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {feedbackStatus === 'idle' && (
                <>
                  <p className="text-slate-600 mb-4">
                    Descreva o que estava errado na análise. Seu feedback será usado para melhorar o sistema.
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Ex: A gravidade deveria ser 'importante' e não 'moderada' porque o gradiente médio é 45mmHg..."
                    className="w-full h-32 px-4 py-3 border border-slate-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {feedbackError && (
                    <p className="mt-2 text-sm text-red-600">{feedbackError}</p>
                  )}
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={closeFeedbackModal}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={processFeedback}
                      disabled={!feedbackText.trim()}
                      className="px-6 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      Enviar Correção
                    </button>
                  </div>
                </>
              )}

              {(feedbackStatus === 'revisando' || feedbackStatus === 'aprendendo') && (
                <div className="py-8 text-center">
                  {/* Animação ECG */}
                  <div className="relative h-16 mb-6 overflow-hidden">
                    <svg className="w-full h-full" viewBox="0 0 200 40" preserveAspectRatio="none">
                      <path
                        d="M0,20 L30,20 L35,20 L40,5 L45,35 L50,20 L55,20 L60,15 L65,25 L70,20 L100,20 L130,20 L135,20 L140,5 L145,35 L150,20 L155,20 L160,15 L165,25 L170,20 L200,20"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        className="animate-pulse"
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          from="400"
                          to="0"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </path>
                    </svg>
                  </div>
                  
                  <div className="space-y-3">
                    <div className={`flex items-center justify-center gap-2 ${feedbackStatus === 'revisando' ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {feedbackStatus === 'revisando' ? (
                        <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                      <span className={feedbackStatus === 'revisando' ? 'font-medium' : ''}>
                        Revisando comentário...
                      </span>
                    </div>
                    <div className={`flex items-center justify-center gap-2 ${feedbackStatus === 'aprendendo' ? 'text-amber-600' : 'text-slate-400'}`}>
                      {feedbackStatus === 'aprendendo' ? (
                        <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                      )}
                      <span className={feedbackStatus === 'aprendendo' ? 'font-medium' : ''}>
                        Aprendendo com o caso...
                      </span>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                      <span>Conhecimento incorporado!</span>
                    </div>
                  </div>
                </div>
              )}

              {feedbackStatus === 'incorporado' && feedbackResult && (
                <div className="py-4">
                  <div className="text-center mb-6">
                    <div className="inline-flex p-3 bg-emerald-100 rounded-full mb-3">
                      <CheckCircle className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Conhecimento Incorporado!</h3>
                    <p className="text-slate-500 text-sm mt-1">Obrigado pelo seu feedback valioso</p>
                  </div>
                  
                  {feedbackResult.lesson && (
                    <div className="bg-blue-50 rounded-xl p-4 mb-4">
                      <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Nova Regra Aprendida
                      </h4>
                      <p className="text-blue-700 text-sm">{feedbackResult.lesson.regra}</p>
                      {feedbackResult.lesson.quando_aplicar && (
                        <p className="text-blue-600 text-xs mt-2">
                          <strong>Quando aplicar:</strong> {feedbackResult.lesson.quando_aplicar}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <p className="text-center text-slate-500 text-sm">
                    Esta regra será aplicada em todas as análises futuras.
                  </p>
                  
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={closeFeedbackModal}
                      className="px-6 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}

              {feedbackStatus === 'error' && (
                <div className="py-8 text-center">
                  <div className="inline-flex p-3 bg-red-100 rounded-full mb-3">
                    <X className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Erro ao Processar</h3>
                  <p className="text-red-600 text-sm mt-2">{feedbackError}</p>
                  <div className="mt-6 flex justify-center gap-3">
                    <button
                      onClick={closeFeedbackModal}
                      className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => setFeedbackStatus('idle')}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-500"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Deleção */}
      {deleteModal.open && (
        <div 
          className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4"
          onClick={() => { setDeleteModal({ open: false, type: 'laudo', id: null, title: '' }); setDeleteConfirmText(''); }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-red-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Confirmar Deleção</h2>
                  <p className="text-sm text-slate-500">Esta ação não pode ser desfeita</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-slate-700 mb-4">
                Você está prestes a deletar {deleteModal.type === 'laudo' ? 'o laudo' : 'a lesson'}:
              </p>
              <p className="font-medium text-slate-800 bg-slate-100 p-3 rounded-lg mb-4">
                {deleteModal.title}
              </p>
              <p className="text-sm text-slate-600">
                Tem certeza que deseja continuar?
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => { setDeleteModal({ open: false, type: 'laudo', id: null, title: '' }); setDeleteConfirmText(''); }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-500"
              >
                Sim, Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhes da Lesson */}
      {selectedLesson && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedLesson(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Brain className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Lesson #{selectedLesson.id}</h2>
                  <p className="text-sm text-slate-500">
                    Criada em {selectedLesson.created_at ? new Date(selectedLesson.created_at).toLocaleString('pt-BR') : '-'}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedLesson(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Toggle ANTES/DEPOIS */}
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex gap-2">
                <button
                  onClick={() => setLessonTab('antes')}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                    lessonTab === 'antes' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  ANTES
                </button>
                <button
                  onClick={() => setLessonTab('depois')}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                    lessonTab === 'depois' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  DEPOIS
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-280px)]">
              {/* Conteúdo da Aba */}
              <div className="p-6 border-b border-slate-100">
                {/* Dados do Paciente */}
                {selectedLesson.paciente && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                      <User className="w-5 h-5 text-slate-400" />
                      Dados do Paciente
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Nome</label>
                        <p className="font-medium text-slate-800 mt-1">{selectedLesson.paciente.nome || '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Idade</label>
                        <p className="font-medium text-slate-800 mt-1">{selectedLesson.paciente.idade ? `${selectedLesson.paciente.idade} anos` : '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Sexo</label>
                        <p className="font-medium text-slate-800 mt-1">{selectedLesson.paciente.sexo === 'M' ? 'Masculino' : selectedLesson.paciente.sexo === 'F' ? 'Feminino' : '-'}</p>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 uppercase">Data Exame</label>
                        <p className="font-medium text-slate-800 mt-1">{selectedLesson.paciente.data_exame || '-'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Análise Clínica */}
                <div className="mb-6">
                  <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-red-500" />
                    Análise Clínica
                    {lessonTab === 'antes' ? (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">ANÁLISE ORIGINAL</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">ANÁLISE CORRIGIDA</span>
                    )}
                  </h3>
                  {lessonTab === 'antes' && selectedLesson.analise_original && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Prioridade</label>
                          <p className="font-medium text-slate-800 mt-1">
                            <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                              selectedLesson.analise_original.prioridade === 'alta' ? 'bg-red-500' :
                              selectedLesson.analise_original.prioridade === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}>
                              {selectedLesson.analise_original.prioridade?.toUpperCase()}
                            </span>
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Gravidade</label>
                          <p className="font-medium text-slate-800 mt-1 capitalize">{selectedLesson.analise_original.gravidade || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Área Valvar (cm²)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_original.area_valvar || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Gradiente (mmHg)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_original.gradiente_medio || '-'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Velocidade (m/s)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_original.velocidade_maxima || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Indicação TAVI</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_original.indicacao_tavi ? <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">SIM</span> : <span className="text-slate-400">Não</span>}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Confiança IA</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_original.confianca ? `${(selectedLesson.analise_original.confianca * 100).toFixed(0)}%` : '-'}</p>
                        </div>
                      </div>
                    </>
                  )}
                  {lessonTab === 'depois' && selectedLesson.analise_corrigida && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Prioridade</label>
                          <p className="font-medium text-slate-800 mt-1">
                            <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                              selectedLesson.analise_corrigida.prioridade === 'alta' ? 'bg-red-500' :
                              selectedLesson.analise_corrigida.prioridade === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}>
                              {selectedLesson.analise_corrigida.prioridade?.toUpperCase()}
                            </span>
                          </p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Gravidade</label>
                          <p className="font-medium text-slate-800 mt-1 capitalize">{selectedLesson.analise_corrigida.gravidade || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Área Valvar (cm²)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_corrigida.area_valvar || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Gradiente (mmHg)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_corrigida.gradiente_medio || '-'}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Velocidade (m/s)</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_corrigida.velocidade_maxima || '-'}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Indicação TAVI</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_corrigida.indicacao_tavi ? <span className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-white">SIM</span> : <span className="text-slate-400">Não</span>}</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 uppercase">Confiança IA</label>
                          <p className="font-medium text-slate-800 mt-1">{selectedLesson.analise_corrigida.confianca ? `${(selectedLesson.analise_corrigida.confianca * 100).toFixed(0)}%` : '-'}</p>
                        </div>
                      </div>
                      <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium">
                        <Zap className="w-3.5 h-3.5" />
                        ✨ Reprocessado com novo conhecimento
                      </div>
                    </>
                  )}
                </div>

                {/* Justificativa */}
                <div className="mb-6">
                  <label className="text-xs text-slate-500 uppercase">Justificativa</label>
                  <p className="text-slate-700 mt-1 bg-slate-50 p-3 rounded-lg">
                    {lessonTab === 'antes' 
                      ? selectedLesson.analise_original?.justificativa 
                      : selectedLesson.analise_corrigida?.justificativa}
                  </p>
                </div>

                {/* Feedback do Médico (só na aba ANTES) */}
                {lessonTab === 'antes' && selectedLesson.feedback_medico && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Feedback do Médico
                    </h4>
                    <p className="text-amber-700">{selectedLesson.feedback_medico}</p>
                  </div>
                )}
              </div>

              {/* Box Lesson Learned */}
              <div className="p-6 bg-gradient-to-r from-purple-50 to-blue-50 border-t-4 border-purple-500">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  LESSON LEARNED
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-purple-600 uppercase font-semibold">Regra</label>
                    <p className="text-lg font-bold text-slate-800 mt-1">{selectedLesson.regra}</p>
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 uppercase font-semibold">Quando Aplicar</label>
                    <p className="text-slate-700 mt-1">{selectedLesson.quando_aplicar}</p>
                  </div>
                  <div>
                    <label className="text-xs text-purple-600 uppercase font-semibold">Exemplo</label>
                    <p className="text-slate-600 mt-1 italic">{selectedLesson.exemplo}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 flex justify-between">
              <button
                onClick={() => openDeleteModal('lesson', selectedLesson.id, `Lesson #${selectedLesson.id}`)}
                className="px-4 py-2 rounded-lg font-medium flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
                Deletar Lesson
              </button>
              <button 
                onClick={() => setSelectedLesson(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
