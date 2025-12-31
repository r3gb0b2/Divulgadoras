
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { findPromotersByEmail } from '../services/promoterService';
import { Organization, Campaign, Promoter } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeftIcon, BoldIcon, ItalicIcon, UnderlineIcon, LinkIcon, ListBulletIcon, ListNumberedIcon, CodeBracketIcon, EyeIcon, CameraIcon, FaceSmileIcon, SearchIcon, TrashIcon, UserIcon } from '../components/Icons';

// --- Local Components for the Editor ---

const HtmlEditor: React.FC<{
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
    const [view, setView] = useState<'visual' | 'html'>('visual');
    const editorRef = useRef<HTMLDivElement>(null);
    const [showEmojis, setShowEmojis] = useState(false);
    const emojis = ['😀', '😍', '👍', '🎉', '🚀', '💡', '💰', '❤️'];

    useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value;
        }
    }, [value]);

    const handleExecCommand = (command: string, valueArg?: string) => {
        document.execCommand(command, false, valueArg);
        if (editorRef.current) {
            const newHtml = editorRef.current.innerHTML;
            onChange(newHtml);
            editorRef.current.focus();
        }
    };

    const handleCreateLink = () => {
        const url = prompt("Insira a URL:", "https://");
        if (url) handleExecCommand('createLink', url);
    };
    
    const handleInsertImage = () => {
        const url = prompt("Insira a URL da imagem:", "https://");
        if (url) handleExecCommand('insertImage', url);
    };

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
        onChange(e.currentTarget.innerHTML);
    };
    
    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    const toolbarButtons = [
        { command: 'bold', icon: BoldIcon, title: 'Negrito' },
        { command: 'italic', icon: ItalicIcon, title: 'Itálico' },
        { command: 'underline', icon: UnderlineIcon, title: 'Sublinhado' },
        { command: 'insertOrderedList', icon: ListNumberedIcon, title: 'Lista Numerada' },
        { command: 'insertUnorderedList', icon: ListBulletIcon, title: 'Lista com Marcadores' },
        { command: 'createLink', icon: LinkIcon, title: 'Inserir Link', action: handleCreateLink },
        { command: 'insertImage', icon: CameraIcon, title: 'Inserir Imagem', action: handleInsertImage },
    ];

    return (
        <div className="border border-gray-600 rounded-md">
            <div className="flex items-center justify-between p-2 bg-gray-700/50 border-b border-gray-600 flex-wrap">
                <div className="flex items-center gap-1">
                    {toolbarButtons.map(btn => (
                         <button key={btn.command} type="button" title={btn.title} onMouseDown={e => e.preventDefault()} onClick={btn.action ? btn.action : () => handleExecCommand(btn.command)} disabled={disabled || view === 'html'} className="p-2 rounded hover:bg-gray-600 disabled:opacity-50">
                            <btn.icon className="w-5 h-5" />
                        </button>
                    ))}
                     <div className="relative">
                        <button type="button" title="Inserir Emoji" onClick={() => setShowEmojis(prev => !prev)} disabled={disabled || view === 'html'} className="p-2 rounded hover:bg-gray-600">
                            <FaceSmileIcon className="w-5 h-5" />
                        </button>
                        {showEmojis && (
                            <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-2 flex gap-1 z-10">
                                {emojis.map(emoji => (
                                    <button key={emoji} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { handleExecCommand('insertText', emoji); setShowEmojis(false); }} className="text-2xl p-1 rounded hover:bg-gray-700">{emoji}</button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <button type="button" onClick={() => setView(v => v === 'visual' ? 'html' : 'visual')} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-gray-600 rounded hover:bg-gray-500">
                    {view === 'visual' ? <CodeBracketIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    <span>{view === 'visual' ? 'HTML' : 'Visual'}</span>
                </button>
            </div>
            {view === 'visual' ? (
                <div ref={editorRef} onInput={handleInput} contentEditable={!disabled} className="min-h-[24rem] p-3 bg-gray-800 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary" />
            ) : (
                <textarea value={value} onChange={handleTextareaChange} disabled={disabled} className="min-h-[24rem] w-full p-3 bg-gray-900 text-gray-200 font-mono text-sm" spellCheck="false" />
            )}
        </div>
    );
};

const Preview: React.FC<{ html: string; subject: string }> = ({ html, subject }) => {
    const emailTemplate = `
        <!DOCTYPE html><html><head><style> body { font-family: sans-serif; background-color: #f4f4f4; color: #333; line-height: 1.6; margin: 0; padding: 20px; } </style></head>
        <body><div style="max-width: 600px; margin: auto; background: white; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">${html}</div></body></html>
    `;
    return (
        <div className="space-y-2 sticky top-24">
            <h3 className="text-lg font-semibold text-white">Pré-visualização</h3>
            <div className="border border-gray-600 rounded-md overflow-hidden bg-dark">
                <div className="p-2 bg-gray-700/50 text-xs text-gray-400">De: Equipe Certa | Assunto: {subject || '(sem assunto)'}</div>
                <iframe srcDoc={emailTemplate} title="Email Preview" className="w-full h-[32rem] bg-gray-300" sandbox="allow-same-origin" />
            </div>
        </div>
    );
};

const NewsletterPage: React.FC = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [audience, setAudience] = useState<'all' | 'org' | 'campaign' | 'individual'>('all');
    const [targetStatus, setTargetStatus] = useState<'approved' | 'rejected'>('approved');
    
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    
    const [individualEmail, setIndividualEmail] = useState('');
    const [isSearchingIndividual, setIsSearchingIndividual] = useState(false);
    const [individualList, setIndividualList] = useState<Promoter[]>([]);

    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('<p>Olá {{promoterName}},</p><p><br></p><p>Escreva sua mensagem aqui...</p>');

    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoadingData(true);
            try {
                const [orgs, camps] = await Promise.all([getOrganizations(), getAllCampaigns()]);
                setOrganizations(orgs.sort((a, b) => a.name.localeCompare(b.name)));
                setCampaigns(camps.sort((a, b) => a.name.localeCompare(b.name)));
            } catch (err: any) {
                setError(err.message || 'Falha ao carregar dados.');
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();
    }, []);

    const searchIndividual = async () => {
        if (!individualEmail.trim()) return;
        setIsSearchingIndividual(true);
        try {
            const results = await findPromotersByEmail(individualEmail);
            if (results.length > 0) {
                const p = results[0];
                if (!individualList.some(item => item.id === p.id)) {
                    setIndividualList([...individualList, p]);
                }
                setIndividualEmail('');
            } else {
                alert("Nenhuma divulgadora encontrada com este e-mail.");
            }
        } catch (e) { alert("Erro na busca."); }
        finally { setIsSearchingIndividual(false); }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim() || !body.trim()) {
            setError("Assunto e corpo da mensagem são obrigatórios.");
            return;
        }

        let audienceData: any = { type: audience, status: targetStatus };

        if (audience === 'org' && selectedOrgId) {
            audienceData.orgId = selectedOrgId;
        } else if (audience === 'campaign' && selectedCampaignId) {
            const camp = campaigns.find(c => c.id === selectedCampaignId);
            audienceData.campaignName = camp?.name;
            audienceData.campaignId = selectedCampaignId;
        } else if (audience === 'individual') {
            if (individualList.length === 0) {
                setError("Adicione pelo menos uma divulgadora na lista individual.");
                return;
            }
            audienceData.promoterIds = individualList.map(p => p.id);
        }

        if (!window.confirm(`Enviar para o público selecionado?`)) return;

        setIsSending(true); setError(''); setSuccess('');
        try {
            const sendNewsletter = httpsCallable(functions, 'sendNewsletter');
            const result = await sendNewsletter({ audience: audienceData, subject, body });
            const data = result.data as any;
            if (data.success) {
                setSuccess(data.message);
                setSubject('');
                setBody('<p>Olá {{promoterName}},</p><p><br></p><p>Escreva sua mensagem aqui...</p>');
                setIndividualList([]);
            } else throw new Error(data.message);
        } catch (err: any) {
            setError(`Falha ao enviar: ${err.message}`);
        } finally { setIsSending(false); }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Enviar Newsletter</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm"><ArrowLeftIcon className="w-4 h-4" /><span>Voltar</span></button>
            </div>
            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md text-sm font-semibold">{error}</div>}
                 {success && <div className="bg-green-900/50 text-green-300 p-3 rounded-md text-sm font-semibold">{success}</div>}
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                            <legend className="px-2 font-semibold text-primary">1. Selecione o Público e Status</legend>
                            
                            <div className="flex bg-dark/50 p-1 rounded-xl w-fit border border-white/5 mb-4">
                                <button type="button" onClick={() => setTargetStatus('approved')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${targetStatus === 'approved' ? 'bg-primary text-white' : 'text-gray-500'}`}>Aprovadas</button>
                                <button type="button" onClick={() => setTargetStatus('rejected')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${targetStatus === 'rejected' ? 'bg-primary text-white' : 'text-gray-500'}`}>Reprovadas</button>
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="audience" value="all" checked={audience === 'all'} onChange={() => setAudience('all')} /><span>Base Global (Todas as {targetStatus === 'approved' ? 'Aprovadas' : 'Reprovadas'})</span></label>
                                
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <label className="flex-shrink-0 flex items-center space-x-2 cursor-pointer"><input type="radio" name="audience" value="org" checked={audience === 'org'} onChange={() => setAudience('org')} /><span>Por Organização:</span></label>
                                    <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} disabled={audience !== 'org'} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 disabled:opacity-50">
                                        <option value="">Selecione...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>
                                
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <label className="flex-shrink-0 flex items-center space-x-2 cursor-pointer"><input type="radio" name="audience" value="campaign" checked={audience === 'campaign'} onChange={() => setAudience('campaign')} /><span>Por Evento:</span></label>
                                    <select value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)} disabled={audience !== 'campaign'} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 disabled:opacity-50">
                                        <option value="">Selecione...</option>
                                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                                    </select>
                                </div>

                                <div className="space-y-3">
                                    <label className="flex items-center space-x-2 cursor-pointer"><input type="radio" name="audience" value="individual" checked={audience === 'individual'} onChange={() => setAudience('individual')} /><span>Individual (Escolher uma a uma)</span></label>
                                    {audience === 'individual' && (
                                        <div className="pl-6 space-y-4">
                                            <div className="flex gap-2">
                                                <input type="email" value={individualEmail} onChange={e => setIndividualEmail(e.target.value)} placeholder="E-mail da divulgadora..." className="flex-grow bg-dark border border-gray-600 rounded-xl px-4 py-2 text-sm" />
                                                <button type="button" onClick={searchIndividual} disabled={isSearchingIndividual} className="px-4 py-2 bg-primary text-white rounded-xl"><SearchIcon className="w-4 h-4"/></button>
                                            </div>
                                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                                {individualList.map(p => (
                                                    <div key={p.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700">
                                                                {p.photoUrls?.[0] ? <img src={p.photoUrls[0]} className="w-full h-full object-cover" /> : <UserIcon className="p-1"/>}
                                                            </div>
                                                            <span className="text-xs font-bold text-white">{p.name}</span>
                                                        </div>
                                                        <button type="button" onClick={() => setIndividualList(individualList.filter(item => item.id !== p.id))} className="text-red-400 hover:text-red-300"><TrashIcon className="w-4 h-4"/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </fieldset>

                        <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                            <legend className="px-2 font-semibold text-primary">2. Crie a Mensagem</legend>
                            <div>
                                <label htmlFor="subject" className="block text-sm font-medium text-gray-300">Assunto</label>
                                <input type="text" id="subject" value={subject} onChange={e => setSubject(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" />
                            </div>
                             <div>
                                <HtmlEditor value={body} onChange={setBody} disabled={isSending} />
                            </div>
                        </fieldset>
                    </div>
                    <div><Preview html={body} subject={subject} /></div>
                </div>

                <div className="flex justify-end mt-6 border-t border-gray-700 pt-4">
                    <button type="submit" disabled={isSending || isLoadingData} className="px-10 py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark disabled:opacity-50 uppercase text-xs tracking-widest shadow-xl shadow-primary/20">
                        {isSending ? 'ENVIANDO...' : 'DISPARAR AGORA'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewsletterPage;
