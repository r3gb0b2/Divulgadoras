
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getAllPromoters } from '../services/promoterService';
import { Organization, Campaign, Promoter } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeftIcon, BoldIcon, ItalicIcon, UnderlineIcon, LinkIcon, ListBulletIcon, ListNumberedIcon, CodeBracketIcon, EyeIcon, CameraIcon, FaceSmileIcon, SearchIcon, TrashIcon, UserIcon, FilterIcon, MegaphoneIcon } from '../components/Icons';

const HtmlEditor: React.FC<{ value: string; onChange: (value: string) => void; disabled?: boolean; }> = ({ value, onChange, disabled }) => {
    const [view, setView] = useState<'visual' | 'html'>('visual');
    const editorRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (editorRef.current && value !== editorRef.current.innerHTML) { editorRef.current.innerHTML = value; } }, [value]);
    const handleExecCommand = (command: string, valueArg?: string) => {
        document.execCommand(command, false, valueArg);
        if (editorRef.current) { onChange(editorRef.current.innerHTML); editorRef.current.focus(); }
    };
    return (
        <div className="border border-gray-600 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-2 bg-gray-800 border-b border-gray-700 flex-wrap">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleExecCommand('bold')} className="p-2 hover:bg-gray-700 rounded text-white"><BoldIcon className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleExecCommand('italic')} className="p-2 hover:bg-gray-700 rounded text-white"><ItalicIcon className="w-4 h-4" /></button>
                    <button type="button" onClick={() => handleExecCommand('underline')} className="p-2 hover:bg-gray-700 rounded text-white"><UnderlineIcon className="w-4 h-4" /></button>
                </div>
                <button type="button" onClick={() => setView(v => v === 'visual' ? 'html' : 'visual')} className="text-[10px] font-black uppercase px-3 py-1 bg-gray-700 rounded-lg text-white">{view === 'visual' ? 'HTML' : 'Visual'}</button>
            </div>
            {view === 'visual' ? <div ref={editorRef} onInput={(e) => onChange(e.currentTarget.innerHTML)} contentEditable={!disabled} className="min-h-[300px] p-4 bg-gray-900 text-gray-200 outline-none" /> : <textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-[300px] w-full p-4 bg-black text-green-400 font-mono text-xs" />}
        </div>
    );
};

const NewsletterPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isFetchingPromoters, setIsFetchingPromoters] = useState(false);

    const [audienceType, setAudienceType] = useState<'all' | 'org' | 'campaign'>('all');
    const [targetStatus, setTargetStatus] = useState<'approved' | 'rejected'>('approved');
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedCampaignName, setSelectedCampaignName] = useState('');
    
    const [selectionMode, setSelectionMode] = useState<'total' | 'individual'>('total');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('<p>Olá {{promoterName}},</p><p><br></p><p>Escreva sua mensagem aqui...</p>');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        const load = async () => {
            setIsLoadingData(true);
            try {
                const [orgs, camps] = await Promise.all([getOrganizations(), getAllCampaigns()]);
                setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
                setCampaigns(camps);
            } finally { setIsLoadingData(false); }
        };
        load();
    }, []);

    useEffect(() => {
        const fetchFiltered = async () => {
            if (audienceType === 'org' && !selectedOrgId) { setPromoters([]); return; }
            if (audienceType === 'campaign' && !selectedCampaignName) { setPromoters([]); return; }

            setIsFetchingPromoters(true);
            try {
                const list = await getAllPromoters({
                    organizationId: selectedOrgId || 'all',
                    filterOrgId: selectedOrgId || 'all',
                    status: targetStatus,
                    selectedCampaign: audienceType === 'campaign' ? selectedCampaignName : 'all'
                });
                setPromoters(list.sort((a,b) => a.name.localeCompare(b.name)));
                setSelectedIds(new Set()); 
            } catch (e) { console.error(e); }
            finally { setIsFetchingPromoters(false); }
        };
        fetchFiltered();
    }, [audienceType, targetStatus, selectedOrgId, selectedCampaignName]);

    const handleToggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim() || !body.trim()) return alert("Preencha assunto e mensagem.");
        
        const finalIds = selectionMode === 'individual' ? Array.from(selectedIds) : [];
        if (selectionMode === 'individual' && finalIds.length === 0) return alert("Selecione pelo menos uma divulgadora.");

        const audienceData = {
            type: selectionMode === 'individual' ? 'individual' : audienceType,
            status: targetStatus,
            orgId: selectedOrgId,
            campaignName: selectedCampaignName,
            promoterIds: finalIds
        };

        if (!window.confirm(`Enviar e-mail para ${selectionMode === 'individual' ? finalIds.length : promoters.length} pessoas?`)) return;

        setIsSending(true);
        try {
            const sendNewsletter = httpsCallable(functions, 'sendNewsletter');
            const result = await sendNewsletter({ audience: audienceData, subject, body });
            const data = result.data as any;
            if (data.success) {
                alert(data.message);
                setSubject('');
                setBody('<p>Olá {{promoterName}},</p>');
                setSelectedIds(new Set());
            } else throw new Error(data.message);
        } catch (err: any) { alert(`Falha: ${err.message}`); }
        finally { setIsSending(false); }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Newsletter Global</h1>
                <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-secondary p-6 rounded-[2.5rem] border border-white/5 shadow-xl space-y-6">
                        <h2 className="text-sm font-black text-primary uppercase tracking-widest flex items-center gap-2"><FilterIcon className="w-4 h-4"/> Audiência e Filtros</h2>
                        
                        <div className="space-y-4">
                            <div className="flex bg-dark p-1 rounded-xl border border-white/5 shadow-inner">
                                <button onClick={() => setTargetStatus('approved')} className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-lg transition-all ${targetStatus === 'approved' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Aprovadas</button>
                                <button onClick={() => setTargetStatus('rejected')} className={`flex-1 py-2.5 text-[10px] font-black uppercase rounded-lg transition-all ${targetStatus === 'rejected' ? 'bg-primary text-white shadow-lg' : 'text-gray-500'}`}>Reprovadas</button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Segmentação</label>
                                <select value={audienceType} onChange={e => setAudienceType(e.target.value as any)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary shadow-lg">
                                    <option value="all">Toda a Base Global</option>
                                    <option value="org">Por Organização</option>
                                    <option value="campaign">Por Evento Específico</option>
                                </select>
                            </div>

                            {audienceType !== 'all' && (
                                <div className="space-y-2 animate-fadeIn">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Selecione a Organização</label>
                                    <select value={selectedOrgId} onChange={e => { setSelectedOrgId(e.target.value); setSelectedCampaignName(''); }} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary">
                                        <option value="">Escolha...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {audienceType === 'campaign' && (
                                <div className="space-y-2 animate-fadeIn">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Selecione o Evento</label>
                                    <select value={selectedCampaignName} onChange={e => setSelectedCampaignName(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary">
                                        <option value="">Escolha...</option>
                                        {campaigns.filter(c => !selectedOrgId || c.organizationId === selectedOrgId).map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="pt-4 border-t border-white/5 space-y-4">
                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Modo de Seleção</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setSelectionMode('total')} className={`py-3 rounded-xl border text-[10px] font-black uppercase transition-all ${selectionMode === 'total' ? 'bg-primary/20 border-primary text-primary' : 'bg-dark border-transparent text-gray-500 shadow-md'}`}>Todas ({promoters.length})</button>
                                    <button onClick={() => setSelectionMode('individual')} className={`py-3 rounded-xl border text-[10px] font-black uppercase transition-all ${selectionMode === 'individual' ? 'bg-primary/20 border-primary text-primary' : 'bg-dark border-transparent text-gray-500 shadow-md'}`}>Manual ({selectedIds.size})</button>
                                </div>
                            </div>
                        </div>

                        {selectionMode === 'individual' && (
                            <div className="space-y-3 animate-fadeIn">
                                <p className="text-[9px] text-gray-400 uppercase font-black tracking-widest px-1">Marque quem deve receber:</p>
                                <div className="h-64 overflow-y-auto bg-dark/50 rounded-2xl border border-white/5 p-2 space-y-1 custom-scrollbar shadow-inner">
                                    {isFetchingPromoters ? <div className="py-10 text-center animate-pulse text-primary font-black text-[10px] uppercase">Buscando perfis...</div> : promoters.length === 0 ? <div className="py-10 text-center text-gray-600 text-xs">Nenhum resultado.</div> : promoters.map(p => (
                                        <label key={p.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer group transition-all">
                                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => handleToggleSelect(p.id)} className="w-4 h-4 rounded border-gray-600 bg-black text-primary focus:ring-primary" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">{p.name}</p>
                                                <p className="text-[9px] text-gray-500 truncate lowercase font-mono">@{p.instagram}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-8">
                    <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-3 bg-primary/10 rounded-2xl text-primary shadow-lg shadow-primary/10"><MegaphoneIcon className="w-6 h-6"/></div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Conteúdo da Mensagem</h2>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Assunto do E-mail</label>
                                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Informações importantes para o evento..." className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:ring-2 focus:ring-primary shadow-xl" />
                            </div>
                            
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-2 block">Texto Principal (Use {"{{promoterName}}"} para personalizar)</label>
                                <HtmlEditor value={body} onChange={setBody} disabled={isSending} />
                            </div>
                        </div>

                        <div className="pt-6 border-t border-white/5 flex justify-end items-center gap-6">
                             <div className="text-right">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Público Alvo</p>
                                <p className="text-primary font-black text-2xl tracking-tighter">{selectionMode === 'individual' ? selectedIds.size : promoters.length} <span className="text-sm font-bold opacity-70">Enviados</span></p>
                             </div>
                             <button onClick={handleSend} disabled={isSending || (selectionMode === 'individual' && selectedIds.size === 0)} className="px-12 py-5 bg-primary text-white font-black rounded-3xl shadow-2xl shadow-primary/40 hover:bg-primary-dark transition-all uppercase text-xs tracking-[0.2em] disabled:opacity-50 transform active:scale-95">
                                {isSending ? 'ENVIANDO...' : 'DISPARAR NEWSLETTER'}
                             </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NewsletterPage;
