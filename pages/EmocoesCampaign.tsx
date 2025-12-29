
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { getActiveVipEvents, checkVipMembership, submitVipMembership } from '../services/vipService';
import { Promoter, VipEvent, VipMembership } from '../types';
import { 
  ArrowLeftIcon, TicketIcon, WhatsAppIcon, 
  CameraIcon, MailIcon, CheckCircleIcon, SparklesIcon,
  DocumentDuplicateIcon, AlertTriangleIcon, UserIcon,
  UsersIcon, ClockIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'payment' | 'success';

const EmocoesCampaign: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        getActiveVipEvents().then(data => {
            setEvents(data);
            setIsLoading(false);
        }).catch(() => {
            setError("Falha ao carregar eventos VIP.");
            setIsLoading(false);
        });
    }, []);

    const handleSelectEvent = (event: VipEvent) => {
        setSelectedEvent(event);
        setStep('benefits');
    };

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !selectedEvent) return;

        setIsLoading(true);
        setError(null);
        try {
            const profiles = await findPromotersByEmail(trimmedEmail);
            // Filtra perfis aprovados para a organização do evento (se o evento for global, aceita qualquer)
            // No momento, VIP Events são globais gerenciados por superadmin
            if (profiles.length > 0) {
                const p = profiles[0];
                const membership = await checkVipMembership(trimmedEmail, selectedEvent.id);
                
                if (membership) {
                    if (membership.status === 'pending') {
                        setError("Sua solicitação para este evento já está em análise! Verifique seu portal.");
                        setIsLoading(false);
                        return;
                    }
                    if (membership.status === 'confirmed') {
                        setError("Você já é um Membro VIP deste evento! Verifique seus vouchers no portal.");
                        setIsLoading(false);
                        return;
                    }
                }

                setPromoter(p);
                setStep('payment');
            } else {
                setError("E-mail não encontrado. Você precisa estar cadastrada em uma produtora antes de aderir ao Clube VIP.");
            }
        } catch (err) {
            setError("Erro ao verificar dados.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProofFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmitProof = async () => {
        if (!promoter || !proofFile || !selectedEvent) return;
        setIsLoading(true);
        setError(null);
        try {
            await submitVipMembership({
                vipEventId: selectedEvent.id,
                vipEventName: selectedEvent.name,
                promoterId: promoter.id,
                promoterName: promoter.name,
                promoterEmail: promoter.email,
                organizationId: promoter.organizationId,
                status: 'pending'
            }, proofFile);
            setStep('success');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading && step === 'select_event') {
        return <div className="py-40 text-center animate-pulse text-gray-500 font-black uppercase tracking-widest">Carregando Eventos VIP...</div>;
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => step === 'select_event' ? navigate(-1) : setStep('select_event')} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
                <ArrowLeftIcon className="w-4 h-4" /> {step === 'select_event' ? 'Voltar' : 'Mudar Evento'}
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 p-10 text-center border-b border-white/5">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
                        <SparklesIcon className="w-10 h-10" />
                    </div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-2">Clube <span className="text-primary">VIP</span></h1>
                    <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em]">Benefícios Exclusivos para Equipes</p>
                </div>

                <div className="p-8 md:p-12">
                    {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-300 rounded-2xl text-xs font-bold text-center animate-shake">{error}</div>}

                    {step === 'select_event' && (
                        <div className="space-y-6 animate-fadeIn">
                             <h2 className="text-xl font-black text-white uppercase tracking-tight text-center">Escolha o Evento</h2>
                             <div className="grid gap-4">
                                {events.map(ev => (
                                    <button 
                                        key={ev.id} onClick={() => handleSelectEvent(ev)}
                                        className="bg-dark/40 p-6 rounded-3xl border border-white/5 hover:border-primary/50 text-left transition-all group"
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-white font-black text-lg uppercase leading-tight">{ev.name}</p>
                                                <p className="text-primary font-black text-xl mt-1">R$ {ev.price.toFixed(2).replace('.', ',')}</p>
                                            </div>
                                            <div className="p-3 bg-primary/10 rounded-2xl group-hover:bg-primary group-hover:text-white transition-all text-primary">
                                                <TicketIcon className="w-6 h-6" />
                                            </div>
                                        </div>
                                    </button>
                                ))}
                                {events.length === 0 && <p className="text-center text-gray-500 py-10 font-bold uppercase text-xs tracking-widest">Nenhum evento VIP disponível no momento.</p>}
                             </div>
                        </div>
                    )}

                    {step === 'benefits' && selectedEvent && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="space-y-4">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Vantagens: {selectedEvent.name}</h2>
                                <p className="text-gray-400 text-sm italic mb-4">{selectedEvent.description}</p>
                                <div className="grid gap-4">
                                    {selectedEvent.benefits.map((b, i) => (
                                        <div key={i} className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex gap-4">
                                            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                                            <p className="text-white font-bold text-sm uppercase">{b}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setStep('identify')} className="w-full py-5 bg-primary text-white font-black text-lg rounded-2xl shadow-xl hover:scale-[1.02] transition-all uppercase tracking-widest">Quero ser VIP!</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Identificação</h2>
                                <p className="text-gray-400 text-sm">Digite o e-mail que você usa na plataforma.</p>
                            </div>
                            <form onSubmit={handleCheckEmail} className="space-y-4">
                                <div className="relative">
                                    <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input 
                                        type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                        className="w-full pl-14 pr-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                        placeholder="Seu e-mail cadastrado"
                                    />
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl disabled:opacity-50">
                                    {isLoading ? 'VERIFICANDO...' : 'PROSSEGUIR'}
                                </button>
                            </form>
                        </div>
                    )}

                    {step === 'payment' && selectedEvent && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="bg-primary/10 p-6 rounded-3xl border border-primary/20 text-center">
                                <p className="text-primary text-xs font-black uppercase tracking-widest mb-2">Olá, {promoter?.name.split(' ')[0]}!</p>
                                <h2 className="text-white text-lg font-bold leading-tight">Pagamento da adesão para {selectedEvent.name}</h2>
                            </div>

                            <div className="bg-dark/60 p-6 rounded-3xl border border-white/5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Taxa de Adesão Única</span>
                                    <span className="text-2xl font-black text-white">R$ {selectedEvent.price.toFixed(2).replace('.', ',')}</span>
                                </div>
                                <div className="p-4 bg-dark rounded-2xl border border-white/5 flex items-center justify-between">
                                    <div className="overflow-hidden mr-4">
                                        <p className="text-[10px] text-gray-500 font-black uppercase">Chave PIX</p>
                                        <p className="text-white font-mono text-sm truncate">{selectedEvent.pixKey}</p>
                                    </div>
                                    <button onClick={() => { navigator.clipboard.writeText(selectedEvent.pixKey); alert("PIX Copiado!"); }} className="p-3 bg-gray-800 text-primary rounded-xl hover:bg-gray-700">
                                        <DocumentDuplicateIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Anexar Comprovante</label>
                                <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-dark/40 py-10 cursor-pointer hover:border-primary transition-all">
                                    {previewUrl ? (
                                        <img src={previewUrl} className="w-32 h-32 object-cover rounded-xl" alt="Preview" />
                                    ) : (
                                        <>
                                            <CameraIcon className="w-10 h-10 text-gray-600 mb-2" />
                                            <span className="text-[9px] font-black text-gray-600 uppercase">Clique para selecionar</span>
                                        </>
                                    )}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                </label>
                                <button 
                                    onClick={handleSubmitProof} 
                                    disabled={isLoading || !proofFile} 
                                    className="w-full py-5 bg-green-600 text-white font-black text-lg rounded-2xl shadow-xl disabled:opacity-30"
                                >
                                    {isLoading ? 'ENVIANDO...' : 'ENVIAR PARA ANÁLISE'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-6 animate-fadeIn py-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircleIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Recebido!</h2>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Seu comprovante foi enviado. A confirmação e os prêmios aparecerão na aba <strong>"Clube VIP"</strong> do seu portal de tarefas assim que validarmos o pagamento.
                            </p>
                            <button onClick={() => navigate('/posts')} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl">IR PARA MEU PORTAL</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmocoesCampaign;
