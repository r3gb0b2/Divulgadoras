
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllVipMemberships, 
    updateVipMembership, 
    getAllVipEvents, 
    createVipEvent, 
    updateVipEvent, 
    deleteVipEvent,
    refundVipMembership
} from '../services/vipService';
import { updatePromoter, getAllPromoters } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent, Organization, Promoter } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, 
    TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon,
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, ExternalLinkIcon, MailIcon, LinkIcon, UndoIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const RECOVERY_TEMPLATES = [
    { s: "Seu VIP está te esperando! 🎟️", b: "Olá {{nome}}, vimos que você iniciou sua adesão ao {{evento}}, mas o pagamento não foi concluído. Seu código de cortesia já está reservado, basta finalizar o Pix abaixo!" },
    { s: "Tivemos um problema com seu Pix? 🤔", b: "Ei {{nome}}, notamos que o Pix gerado para o {{evento}} expirou. Para você não perder os benefícios exclusivos, geramos um novo código agora mesmo. Aproveite!" },
    { s: "Não deixe sua cortesia expirar! ⏳", b: "Olá {{nome}}! Muitas pessoas estão solicitando acesso ao {{evento}} agora. Como você já iniciou o processo, sua vaga está garantida por mais alguns minutos. Finalize aqui:" },
    { s: "Sua vaga no VIP do {{evento}} 🚀", b: "Fala {{nome}}! Passando para lembrar que seu ingresso promocional está aguardando confirmação. O processo é automático após o pagamento do Pix abaixo." },
    { s: "Esqueceu de finalizar sua adesão? 😱", b: "Oi {{nome}}, percebemos que você parou na tela de pagamento. Se teve alguma dúvida, estamos aqui! Caso queira seguir, aqui está um novo Pix para o {{evento}}." },
    { s: "Tudo pronto para o {{evento}}? ✅", b: "Olá {{nome}}, só falta o pagamento do seu Pix para liberarmos seu código VIP. Não fique de fora da nossa equipe oficial!" },
    { s: "Vaga VIP reservada para {{nome}} 🌟", b: "Reservamos seu lugar no Clube VIP para o {{evento}}. Clique abaixo para ver o novo QR Code e garantir seus benefícios antes que o lote mude." },
    { s: "Sua cortesia está quase liberada! 🔓", b: "Ei {{nome}}! Recebemos sua solicitação para o {{evento}}. Assim que o Pix abaixo for confirmado, seu código de resgate chegará instantaneamente no seu e-mail." },
    { s: "Ei, falta só um passo! 👣", b: "Olá {{nome}}, falta muito pouco para você garantir seu acesso exclusivo ao {{evento}}. O Pix abaixo é válido por tempo limitado. Garanta agora!" },
    { s: "VIP: Sua participação confirmada? 🎫", b: "Oi {{nome}}! Ainda não identificamos seu pagamento para o {{evento}}. Queremos muito você na nossa equipe, finalize sua adesão no link abaixo:" },
    { s: "Última chamada para o VIP! 📣", b: "Olá {{nome}}, esta é a última oportunidade de garantir o valor promocional para o {{evento}}. Geramos um novo Pix final para você." },
    { s: "Problemas com o pagamento? 🛠️", b: "Olá {{nome}}, notamos que seu Pix não foi concluído. Se precisar de suporte, responda este e-mail. Caso queira tentar novamente, aqui está o código:" },
    { s: "Seu lugar está garantido! (Por enquanto) ✋", b: "Ei {{nome}}, seguramos sua vaga VIP no {{evento}} por mais um pouco. Mas corra, o sistema libera para a fila de espera em breve!" },
    { s: "O {{evento}} te espera! ✨", b: "Olá {{nome}}! Não perca a chance de viver essa experiência com benefícios exclusivos. Finalize sua adesão agora com o Pix abaixo:" },
    { s: "Aviso de pendência: {{evento}} 📁", b: "Prezada {{nome}}, consta em nosso sistema uma adesão VIP pendente de pagamento. Para ativar seus benefícios, utilize o QR Code atualizado abaixo." },
    { s: "Copy VIP exclusiva para você 💎", b: "Olá {{nome}}, como você é da nossa base, liberamos este acesso especial para o {{evento}}. O Pix abaixo garante seu lugar imediatamente." },
    { s: "Sua cortesia VIP vai expirar... 🎈", b: "Oi {{nome}}! O tempo para garantir seu ingresso do {{evento}} pelo valor de membro está acabando. Não perca essa chance!" },
    { s: "Dúvida sobre o Clube VIP? ❓", b: "Olá {{nome}}, vimos que você se interessou pelo {{evento}}. Alguma dúvida sobre os benefícios? Se estiver tudo ok, você pode finalizar por aqui:" },
    { s: "Confirmando seu interesse no {{evento}} 🤝", b: "Fala {{nome}}! Queremos garantir que você receba seu código VIP a tempo. Use este novo Pix para uma confirmação instantânea." },
    { s: "Quase lá, {{nome}}! 🏁", b: "Sua jornada rumo ao VIP do {{evento}} está 90% concluída. Só falta o pagamento. Aqui está o Pix atualizado para você finalizar em 1 minuto!" }
];

declare global {
  interface Window {
    XLSX: any;
  }
}

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events' | 'recovery'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'refunded' | 'all'>('all');
    const [filterBenefit, setFilterBenefit] = useState<'active' | 'waiting' | 'all'>('all');
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!isSuperAdmin) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [orgsData, eventsData, membersData] = await Promise.all([
                getOrganizations(),
                getAllVipEvents(),
                getAllVipMemberships(selectedEventId)
            ]);
            
            const orgMap = orgsData.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
            setOrganizations(orgMap);
            setVipEvents(eventsData);
            setMemberships(membersData);
        } catch (e) {
            console.error("Erro ao carregar dados VIP:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedEventId, isSuperAdmin]);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    const filteredMembers = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesBenefit = filterBenefit === 'all' || 
                (filterBenefit === 'active' && m.isBenefitActive === true) ||
                (filterBenefit === 'waiting' && m.isBenefitActive === false && m.status === 'confirmed');
            
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(query) || 
                (m.promoterEmail || '').toLowerCase().includes(query);
            
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesStatus && matchesBenefit && matchesSearch && matchesEvent;
        });
    }, [memberships, filterStatus, filterBenefit, searchQuery, selectedEventId]);

    const recoveryMembers = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return memberships.filter(m => {
            if (m.status === 'confirmed' || m.status === 'refunded') return false;
            
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(query) || 
                (m.promoterEmail || '').toLowerCase().includes(query);
                
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesSearch && matchesEvent;
        });
    }, [memberships, searchQuery, selectedEventId]);

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const targetList = activeTab === 'members' ? filteredMembers : recoveryMembers;
            const allIds = targetList.map(m => m.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleCopy = (text: string, msg: string = "Código copiado!") => {
        navigator.clipboard.writeText(text);
        alert(msg);
    };

    const handleDownloadXLSX = (mode: 'codes' | 'full') => {
        const listToExport = selectedIds.size > 0 
            ? filteredMembers.filter(m => selectedIds.has(m.id))
            : filteredMembers;

        if (listToExport.length === 0) return alert("Nenhum dado para exportar.");
        
        let ws;
        if (mode === 'codes') {
            const aoaData = listToExport
                .filter(m => m.benefitCode && m.benefitCode.trim() !== '')
                .map(m => [m.benefitCode]);

            if (aoaData.length === 0) return alert("Nenhum código gerado para exportar.");
            ws = window.XLSX.utils.aoa_to_sheet(aoaData);
        } else {
            const jsonData = listToExport.map(m => ({
                'NOME': m.promoterName,
                'E-MAIL': m.promoterEmail,
                'WHATSAPP': m.promoterWhatsapp || '',
                'INSTAGRAM': m.promoterInstagram || '',
                'CÓDIGO VIP': m.benefitCode || '',
                'EVENTO': m.vipEventName,
                'STATUS PGTO': m.status === 'confirmed' ? 'PAGO' : m.status === 'refunded' ? 'ESTORNADO' : 'PENDENTE',
                'ATIVAÇÃO': m.isBenefitActive ? 'SIM' : 'NÃO',
                'DATA ADESÃO': m.submittedAt ? (m.submittedAt as any).toDate().toLocaleString('pt-BR') : ''
            }));
            ws = window.XLSX.utils.json_to_sheet(jsonData);
        }

        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Membros VIP");
        window.XLSX.writeFile(wb, `membros_vip_${mode === 'codes' ? 'codigos' : 'completo'}_${new Date().getTime()}.xlsx`);
    };

    const handleManualNotifySingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        setIsBulkProcessing(true);
        try {
            await updateVipMembership(membership.id, { isBenefitActive: true });
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            await notifyActivation({ membershipId: membership.id });
            alert("Sucesso!"); fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleRefundAction = async (membership: VipMembership) => {
        if (!window.confirm(`ATENÇÃO: Deseja estornar a adesão de ${membership.promoterName}? O valor sairá das métricas e o benefício será cancelado no portal dela.`)) return;
        setIsProcessingId(membership.id);
        try {
            await refundVipMembership(membership.id);
            // Também remove o status de VIP do perfil da divulgadora
            await updatePromoter(membership.promoterId, { 
                emocoesStatus: 'rejected',
                emocoesBenefitActive: false 
            });
            alert("Adesão estornada com sucesso!");
            fetchData();
        } catch (e: any) { alert("Erro ao estornar: " + e.message); } finally { setIsProcessingId(null); }
    };

    const handleBulkNotify = async () => {
        const toProcess = filteredMembers.filter(m => selectedIds.has(m.id) && m.status === 'confirmed');
        if (toProcess.length === 0) return alert("Selecione membros com pagamento PAGO.");
        if (!window.confirm(`Ativar e notificar ${toProcess.length} membros?`)) return;
        
        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            for (const m of toProcess) {
                await updateVipMembership(m.id, { isBenefitActive: true });
                await updatePromoter(m.promoterId, { emocoesBenefitActive: true });
                await notifyActivation({ membershipId: m.id });
            }
            alert("Processado com sucesso!");
            setSelectedIds(new Set());
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleRecoveryEmail = async (m: VipMembership) => {
        const event = vipEvents.find(e => e.id === m.vipEventId);
        if (!event) return;

        if (!window.confirm(`Enviar e-mail de recuperação para ${m.promoterName}? O sistema escolherá uma das 20 mensagens de copy aleatoriamente.`)) return;
        
        setIsProcessingId(m.id);
        try {
            // Seleciona template aleatório
            const template = RECOVERY_TEMPLATES[Math.floor(Math.random() * RECOVERY_TEMPLATES.length)];
            const formattedBody = template.b
                .replace(/{{nome}}/g, m.promoterName.split(' ')[0])
                .replace(/{{evento}}/g, event.name);
            const formattedSubject = template.s.replace(/{{nome}}/g, m.promoterName.split(' ')[0]).replace(/{{evento}}/g, event.name);

            const createPix = httpsCallable(functions, 'createVipPixPayment');
            const pixRes: any = await createPix({
                vipEventId: m.vipEventId,
                promoterId: m.promoterId,
                email: m.promoterEmail,
                name: m.promoterName,
                whatsapp: m.promoterWhatsapp || "",
                instagram: m.promoterInstagram || "",
                amount: event.price
            });

            const sendRecovery = httpsCallable(functions, 'sendVipRecoveryEmail');
            await sendRecovery({
                membershipId: m.id,
                pixData: pixRes.data,
                customMessage: formattedBody,
                subject: formattedSubject
            });

            alert("E-mail de recuperação enviado com sucesso!");
            fetchData();
        } catch (e: any) { alert("Erro: " + e.message); } finally { setIsProcessingId(null); }
    };

    const handleBulkRecovery = async () => {
        const toProcess = recoveryMembers.filter(m => selectedIds.has(m.id));
        if (toProcess.length === 0) return alert("Selecione leads.");
        if (!window.confirm(`Enviar recuperação para ${toProcess.length} leads? Cada um receberá uma mensagem de copy diferente.`)) return;
        
        setIsBulkProcessing(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const createPix = httpsCallable(functions, 'createVipPixPayment');
            const sendRecovery = httpsCallable(functions, 'sendVipRecoveryEmail');
            
            for (const m of toProcess) {
                try {
                    const event = vipEvents.find(e => e.id === m.vipEventId);
                    if (!event) continue;

                    const template = RECOVERY_TEMPLATES[Math.floor(Math.random() * RECOVERY_TEMPLATES.length)];
                    const formattedBody = template.b.replace(/{{nome}}/g, m.promoterName.split(' ')[0]).replace(/{{evento}}/g, event.name);
                    const formattedSubject = template.s.replace(/{{nome}}/g, m.promoterName.split(' ')[0]).replace(/{{evento}}/g, event.name);

                    const pixRes: any = await createPix({
                        vipEventId: m.vipEventId,
                        promoterId: m.promoterId,
                        email: m.promoterEmail,
                        name: m.promoterName,
                        whatsapp: m.promoterWhatsapp || "",
                        instagram: m.promoterInstagram || "",
                        amount: event.price
                    });

                    await sendRecovery({
                        membershipId: m.id,
                        pixData: pixRes.data,
                        customMessage: formattedBody,
                        subject: formattedSubject
                    });
                    successCount++;
                } catch (err) { failCount++; }
            }
            alert(`Concluído! Sucesso: ${successCount}, Falhas: ${failCount}`);
            setSelectedIds(new Set());
            fetchData();
        } catch (e: any) { alert("Erro fatal."); } finally { setIsBulkProcessing(false); }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name || !editingEvent?.price) return;
        setIsBulkProcessing(true);
        try {
            const data = {
                name: editingEvent.name,
                price: Number(editingEvent.price),
                isActive: editingEvent.isActive ?? true,
                isSoldOut: editingEvent.isSoldOut ?? false,
                description: editingEvent.description || '',
                benefits: editingEvent.benefits || [],
                externalSlug: editingEvent.externalSlug || '',
                pixelId: editingEvent.pixelId || '',
                pixKey: editingEvent.pixKey || ''
            };
            if (editingEvent.id) await updateVipEvent(editingEvent.id, data);
            else await createVipEvent(data as any);
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm("Excluir oferta VIP?")) return;
        try {
            await deleteVipEvent(id);
            fetchData();
        } catch (e: any) { alert(e.message); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex flex-wrap gap-2">
                    {activeTab === 'members' && (
                        <>
                            <button onClick={() => window.open('/#/admin/vip-metrics/global', '_blank')} className="px-4 py-3 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-900/50">
                                <ChartBarIcon className="w-4 h-4" /> Relatório Público
                            </button>
                            <button onClick={() => handleDownloadXLSX('codes')} className="px-4 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-white">
                                <DownloadIcon className="w-4 h-4" /> Códigos (.xlsx)
                            </button>
                            <button onClick={() => handleDownloadXLSX('full')} className="px-4 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-white">
                                <DownloadIcon className="w-4 h-4" /> Dados Completos
                            </button>
                        </>
                    )}
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [], isActive: true, isSoldOut: false }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0 overflow-x-auto max-w-full">
                <button onClick={() => { setActiveTab('members'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros</button>
                <button onClick={() => { setActiveTab('recovery'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'recovery' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Recuperação de Carrinho</button>
                <button onClick={() => { setActiveTab('events'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Eventos / Ofertas</button>
            </div>

            {selectedIds.size > 0 && (
                <div className="mx-4 md:mx-0 p-4 bg-primary rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn sticky top-24 z-30 mb-6 border border-white/20">
                    <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} selecionados</p>
                    <div className="flex gap-2">
                        {activeTab === 'members' && (
                            <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">
                                {isBulkProcessing ? 'PROCESSANDO...' : 'ATIVAR E NOTIFICAR'}
                            </button>
                        )}
                        {activeTab === 'recovery' && (
                            <button onClick={handleBulkRecovery} disabled={isBulkProcessing} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">
                                {isBulkProcessing ? 'ENVIANDO...' : 'RECUPERAR (E-MAILS ALEATÓRIOS)'}
                            </button>
                        )}
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <RefreshIcon className="w-10 h-10 text-primary animate-spin" />
                </div>
            ) : (
                <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                    
                    {/* ABA MEMBROS */}
                    {activeTab === 'members' && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                    <option value="all">TODOS EVENTOS</option>
                                    {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                    <option value="all">STATUS PGTO (TODOS)</option>
                                    <option value="confirmed">PAGO</option>
                                    <option value="pending">PENDENTE</option>
                                    <option value="refunded">ESTORNADO</option>
                                </select>
                                <select value={filterBenefit} onChange={e => setFilterBenefit(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                    <option value="all">ATIVAÇÃO (TODAS)</option>
                                    <option value="active">ATIVADOS</option>
                                    <option value="waiting">AGUARDANDO ATIVAÇÃO</option>
                                </select>
                                <div className="relative">
                                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input type="text" placeholder="BUSCAR NOME OU E-MAIL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll}
                                                    checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                                                    className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                />
                                            </th>
                                            <th className="px-6 py-5">Membro</th>
                                            <th className="px-6 py-5 text-center">Código</th>
                                            <th className="px-6 py-5 text-center">Ativação</th>
                                            <th className="px-6 py-5 text-center">Status Pgto</th>
                                            <th className="px-6 py-5 text-right">Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredMembers.map(m => {
                                            const event = vipEvents.find(e => e.id === m.vipEventId);
                                            const directLink = event?.externalSlug && m.benefitCode 
                                                ? `https://stingressos.com.br/eventos/${event.externalSlug}?cupom=${m.benefitCode}`
                                                : null;

                                            return (
                                                <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                    <td className="px-6 py-5 text-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedIds.has(m.id)}
                                                            onChange={() => toggleSelectOne(m.id)}
                                                            className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                        />
                                                    </td>
                                                    <td className="px-6 py-5">
                                                        <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono lowercase truncate">{m.promoterEmail}</p>
                                                        <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                                    </td>
                                                    <td className="px-6 py-5 text-center">{m.benefitCode ? <span onClick={() => handleCopy(m.benefitCode || '')} className="px-3 py-1 bg-dark text-primary border border-primary/30 rounded-lg font-mono text-xs font-black tracking-widest cursor-pointer hover:bg-primary/10">{m.benefitCode}</span> : <span className="text-gray-600 text-[10px] font-bold">---</span>}</td>
                                                    <td className="px-6 py-5 text-center">{m.isBenefitActive ? <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">ATIVADO</span> : <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700 text-[8px] font-black uppercase tracking-widest">AGUARDANDO</span>}</td>
                                                    <td className="px-6 py-5 text-center">
                                                        <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : m.status === 'refunded' ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
                                                            {m.status === 'confirmed' ? 'PAGO' : m.status === 'refunded' ? 'ESTORNADO' : 'PENDENTE'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-5 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            {m.status === 'confirmed' && directLink && (
                                                                <button 
                                                                    onClick={() => handleCopy(directLink, "Link direto copiado!")}
                                                                    className="p-2 bg-dark border border-primary/20 text-primary rounded-xl hover:bg-primary/10 transition-all"
                                                                    title="Copiar Link Direto"
                                                                >
                                                                    <LinkIcon className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            {m.status === 'confirmed' && (
                                                                <>
                                                                    <button onClick={() => handleManualNotifySingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">{m.isBenefitActive ? 'REENVIAR' : 'ATIVAR'}</button>
                                                                    <button onClick={() => handleRefundAction(m)} disabled={isProcessingId === m.id} className="p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-900/30" title="Estornar">
                                                                        <UndoIcon className="w-4 h-4" />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ABA RECUPERAÇÃO */}
                    {activeTab === 'recovery' && (
                        <>
                            <div className="flex flex-col md:flex-row gap-4">
                                <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary w-full md:w-64">
                                    <option value="all">TODOS EVENTOS</option>
                                    {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <div className="relative flex-grow">
                                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input type="text" placeholder="BUSCAR POR NOME OU E-MAIL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll}
                                                    checked={recoveryMembers.length > 0 && selectedIds.size === recoveryMembers.length}
                                                    className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                />
                                            </th>
                                            <th className="px-6 py-5">Potencial Membro</th>
                                            <th className="px-6 py-5">WhatsApp</th>
                                            <th className="px-6 py-5">Data Tentativa</th>
                                            <th className="px-6 py-5 text-right">Recuperar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {recoveryMembers.map(m => (
                                            <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(m.id)}
                                                        onChange={() => toggleSelectOne(m.id)}
                                                        className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                    />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono lowercase truncate">{m.promoterEmail}</p>
                                                    <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                                </td>
                                                <td className="px-6 py-5 text-sm text-gray-400 font-mono">{m.promoterWhatsapp || '---'}</td>
                                                <td className="px-6 py-5 text-xs text-gray-500">{m.submittedAt ? (m.submittedAt as any).toDate().toLocaleDateString('pt-BR') : '---'}</td>
                                                <td className="px-6 py-5 text-right">
                                                    <button 
                                                        onClick={() => handleRecoveryEmail(m)} 
                                                        disabled={isProcessingId === m.id}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-blue-500 flex items-center gap-2"
                                                    >
                                                        {isProcessingId === m.id ? <RefreshIcon className="w-3 h-3 animate-spin"/> : <MailIcon className="w-3 h-3" />} E-MAIL (COPY ALEATÓRIA)
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {recoveryMembers.length === 0 && (
                                            <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs tracking-widest">Nenhum carrinho abandonado encontrado.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ABA EVENTOS */}
                    {activeTab === 'events' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {vipEvents.map(ev => (
                                <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex flex-col group hover:border-primary transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0 flex-grow">
                                            <h3 className="text-xl font-black text-white uppercase truncate">{ev.name}</h3>
                                            <p className="text-primary font-black text-lg mt-1">R$ {ev.price.toFixed(2)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                            {ev.isSoldOut && <span className="px-2 py-0.5 bg-red-600 text-white text-[8px] font-black rounded uppercase">ESGOTADO</span>}
                                        </div>
                                    </div>
                                    <div className="flex-grow space-y-2 mb-6">
                                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Benefícios:</p>
                                        {ev.benefits.map((b, i) => (
                                            <p key={i} className="text-xs text-gray-300 flex items-center gap-2"><CheckCircleIcon className="w-3 h-3 text-primary" /> {b}</p>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="flex-1 py-3 bg-gray-800 text-white font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 transition-all border border-white/5">Editar</button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-3 bg-red-900/30 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-900/50"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            ))}
                            {vipEvents.length === 0 && (
                                <div className="col-span-full py-20 text-center text-gray-500 font-black uppercase text-xs tracking-widest">Nenhuma oferta VIP cadastrada.</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* MODAL DE EVENTO VIP */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{editingEvent?.id ? 'Editar Evento VIP' : 'Novo Evento VIP'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                        </div>

                        <form onSubmit={handleSaveEvent} className="flex-grow overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome do Evento</label>
                                    <input type="text" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Slug Externo (Site ST Ingressos)</label>
                                    <input type="text" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} placeholder="ex: emocoes-sunset" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Meta Pixel ID (Opcional)</label>
                                    <input type="text" value={editingEvent?.pixelId || ''} onChange={e => setEditingEvent({...editingEvent!, pixelId: e.target.value})} placeholder="Apenas o ID numérico" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (Um por linha)</label>
                                <textarea rows={4} value={editingEvent?.benefits?.join('\n') || ''} onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="flex items-center gap-3 cursor-pointer p-4 bg-dark/50 rounded-2xl border border-white/5 hover:border-primary/30 transition-all">
                                    <input type="checkbox" checked={editingEvent?.isActive || false} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-dark text-primary" />
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Oferta Ativa no Site</span>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer p-4 bg-dark/50 rounded-2xl border border-white/5 hover:border-red-500/30 transition-all">
                                    <input type="checkbox" checked={editingEvent?.isSoldOut || false} onChange={e => setEditingEvent({...editingEvent!, isSoldOut: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-dark text-red-500" />
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Marcar como Esgotado</span>
                                </label>
                            </div>

                            <button type="submit" disabled={isBulkProcessing} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest disabled:opacity-50">
                                {isBulkProcessing ? 'SALVANDO...' : 'CONFIRMAR E SALVAR'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminClubVip;
