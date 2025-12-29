
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveVipEvents, checkVipMembership } from '../services/vipService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  DocumentDuplicateIcon, RefreshIcon, UserIcon, PhoneIcon, InstagramIcon,
  AlertTriangleIcon, SearchIcon, ClockIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'confirm_data' | 'payment' | 'success';

const ClubVipHome: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
    
    // Dados do formulário
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [instagram, setInstagram] = useState('');
    
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pixData, setPixData] = useState<{ qr_code: string, qr_code_base64: string } | null>(null);

    useEffect(() => {
        getActiveVipEvents().then(data => {
            setEvents(data);
            setIsLoading(false);
        }).catch(() => {
            setError("Falha ao carregar ofertas VIP.");
            setIsLoading(false);
        });
    }, []);

    // Observer para detecção automática de pagamento
    useEffect(() => {
        if (step === 'payment' && promoter && selectedEvent) {
            const unsubscribe = firestore.collection('promoters').doc(promoter.id)
                .onSnapshot((doc) => {
                    const data = doc.data();
                    if (data?.emocoesStatus === 'confirmed') {
                        setStep('success');
                        if (navigator.vibrate) navigator.vibrate(200);
                    }
                });
            return () => unsubscribe();
        }
    }, [step, promoter, selectedEvent]);

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !selectedEvent) return;

        setIsLoading(true);
        setError(null);
        try {
            const profiles = await findPromotersByEmail(trimmedEmail);
            const membership = await checkVipMembership(trimmedEmail, selectedEvent.id);
            
            // SE JÁ É VIP: Redireciona para o painel de status
            if (membership?.status === 'confirmed') {
                localStorage.setItem('saved_promoter_email', trimmedEmail);
                navigate('/status');
                return;
            }

            if (profiles.length > 0) {
                const p = profiles[0];
                setPromoter(p);
                setName(p.name);
                setWhatsapp(p.whatsapp);
                setInstagram(p.instagram);
            } else {
                setPromoter(null);
                setName('');
                setWhatsapp('');
                setInstagram('');
            }
            
            setStep('confirm_data');
            setIsLoading(false);
        } catch (err: any) {
            setError("Erro ao verificar e-mail.");
            setIsLoading(false);
        }
    };

    const handleProceedToPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !whatsapp.trim() || !instagram.trim() || !selectedEvent) return;
        
        setIsLoading(true);
        try {
            let pId = promoter?.id;
            const sanitizedWhatsapp = whatsapp.replace(/\D/g, '');
            const sanitizedInstagram = instagram.replace('@', '').trim();

            if (!pId) {
                pId = await createVipPromoter({ name, email, whatsapp: sanitizedWhatsapp });
            }
            
            await firestore.collection('promoters').doc(pId).update({
                whatsapp: sanitizedWhatsapp,
                instagram: sanitizedInstagram
            });

            const finalPromoter = { id: pId, name, email, whatsapp: sanitizedWhatsapp, instagram: sanitizedInstagram } as Promoter;
            setPromoter(finalPromoter);

            const createPix = httpsCallable(functions, 'createVipPixPayment');
            const res: any = await createPix({
                vipEventId: selectedEvent.id,
                promoterId: pId,
                email: email.toLowerCase().trim(),
                name: name.trim(),
                whatsapp: sanitizedWhatsapp,
                instagram: sanitizedInstagram,
                amount: selectedEvent.price
            });
            
            setPixData(res.data);
            setStep('payment');
        } catch (err: any) {
            setError(err.message || "Erro ao gerar pagamento.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            {step !== 'select_event' && (
                <button onClick={() => setStep('select_event')} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            )}

            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 p-12 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                    <SparklesIcon className="w-16 h-16 text-primary mx-auto mb-4 relative z-10 animate-pulse" />
                    <h1 className="text-5xl font-black text-white uppercase tracking-tighter relative z-10">CLUBE <span className="text-primary">VIP</span></h1>
                    <p className="text-gray-300 font-bold uppercase text-xs tracking-[0.4em] mt-3 relative z-10">Experiências Exclusivas</p>
                </div>

                <div className="p-10">
                    {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-300 rounded-2xl text-xs font-bold text-center flex items-center gap-3"><AlertTriangleIcon className="w-5 h-5 flex-shrink-0" /> {error}</div>}

                    {step === 'select_event' && (
                        <div className="space-y-8">
                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                                <Link to="/clubvip/como-funciona" className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">
                                    <ClockIcon className="w-4 h-4" /> Como Funciona?
                                </Link>
                                <Link to="/status" className="flex items-center justify-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-gray-400 hover:text-white transition-all">
                                    <SearchIcon className="w-4 h-4" /> Consultar meu Status
                                </Link>
                            </div>

                            <div className="grid gap-6">
                                <h2 className="text-xl font-black text-white uppercase tracking-widest text-center mb-2">Escolha sua Vantagem</h2>
                                {events.map(ev => (
                                    <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('benefits'); }} className="bg-dark/60 p-8 rounded-[2rem] border border-white/5 hover:border-primary text-left transition-all group flex justify-between items-center shadow-lg">
                                        <div>
                                            <p className="text-white font-black text-xl uppercase group-hover:text-primary transition-colors">{ev.name}</p>
                                            <p className="text-[10px] text-gray-500 font-black uppercase mt-1">Adesão Imediata</p>
                                        </div>
                                        <p className="text-primary font-black text-2xl">R$ {ev.price.toFixed(2).replace('.', ',')}</p>
                                    </button>
                                ))}
                                {events.length === 0 && !isLoading && <p className="text-center text-gray-500 font-bold uppercase text-xs py-10">Nenhuma oferta VIP disponível no momento.</p>}
                            </div>
                        </div>
                    )}

                    {step === 'benefits' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="text-center">
                                <h2 className="text-3xl font-black text-white uppercase tracking-tight">{selectedEvent?.name}</h2>
                                <p className="text-primary font-black text-sm mt-1 uppercase">Seu pacote de benefícios</p>
                            </div>
                            
                            <div className="bg-dark/40 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                                {selectedEvent?.benefits.map((b, i) => (
                                    <div key={i} className="flex gap-5 text-gray-200 text-lg">
                                        <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
                                            <CheckCircleIcon className="w-4 h-4 text-primary" /> 
                                        </div>
                                        <span className="font-bold tracking-tight">{b}</span>
                                    </div>
                                ))}
                            </div>
                            
                            <button onClick={() => setStep('identify')} className="w-full py-6 bg-primary text-white font-black rounded-3xl hover:bg-primary-dark shadow-2xl shadow-primary/30 transition-all uppercase text-sm tracking-widest transform active:scale-95">REIVINDICAR ACESSO VIP</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleCheckEmail} className="space-y-6 text-center animate-fadeIn">
                            <h2 className="text-2xl font-black text-white uppercase">Quem é você?</h2>
                            <p className="text-gray-400 text-sm mb-6 font-medium">Informe seu e-mail para vincularmos seus benefícios.</p>
                            <input 
                                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full p-6 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-black text-center text-xl"
                                placeholder="seu@email.com"
                            />
                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] uppercase text-sm tracking-widest shadow-xl">
                                {isLoading ? 'SINCROIZANDO...' : 'PRÓXIMO PASSO'}
                            </button>
                        </form>
                    )}

                    {step === 'confirm_data' && (
                        <form onSubmit={handleProceedToPayment} className="space-y-5 animate-fadeIn">
                            <h2 className="text-2xl font-black text-white text-center uppercase mb-6">Confirme seus Dados</h2>
                            
                            <div className="relative">
                                <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" />
                                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Nome Completo" />
                            </div>
                            
                            <div className="relative">
                                <PhoneIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" />
                                <input type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="WhatsApp" />
                            </div>

                            <div className="relative">
                                <InstagramIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500" />
                                <input type="text" required value={instagram} onChange={e => setInstagram(e.target.value)} className="w-full p-6 pl-16 bg-dark border border-white/10 rounded-[2rem] text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Instagram" />
                            </div>

                            <button type="submit" disabled={isLoading} className="w-full py-6 bg-primary text-white font-black rounded-[2rem] shadow-2xl shadow-primary/30 uppercase text-sm tracking-widest mt-4">
                                {isLoading ? 'PROCESSANDO...' : 'PROSSEGUIR PARA O PIX'}
                            </button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="space-y-10 text-center animate-fadeIn">
                            <div>
                                <p className="text-white font-black text-lg uppercase tracking-widest">Aguardando Pagamento</p>
                                <p className="text-gray-500 text-xs font-bold uppercase mt-1">Sua cortesia será liberada após o Pix</p>
                            </div>

                            <div className="bg-white p-6 rounded-[3rem] inline-block mx-auto shadow-2xl border-4 border-primary/20">
                                <img src={`data:image/jpeg;base64,${pixData.qr_code_base64}`} alt="QR Code Pix" className="w-64 h-64" />
                            </div>
                            
                            <div className="bg-dark/60 p-8 rounded-[2.5rem] border border-white/5 space-y-4">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Copia e Cola</p>
                                <div className="flex gap-3">
                                    <input readOnly value={pixData.qr_code} className="bg-dark p-4 rounded-2xl text-[10px] text-gray-400 font-mono flex-grow border border-white/5" />
                                    <button type="button" onClick={() => { navigator.clipboard.writeText(pixData.qr_code); alert("Pix Copiado!"); }} className="p-4 bg-primary text-white rounded-2xl shadow-lg">
                                        <DocumentDuplicateIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-4 py-4 text-blue-400 font-black animate-pulse">
                                <RefreshIcon className="w-6 h-6 animate-spin" />
                                <span className="text-xs uppercase tracking-widest text-center leading-tight">O sistema detectará seu Pix<br/>automaticamente em instantes</span>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-16 space-y-8 animate-fadeIn">
                            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(34,197,94,0.2)] border-2 border-green-500/30">
                                <CheckCircleIcon className="w-14 h-14 text-green-500" />
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">ADESÃO CONFIRMADA!</h2>
                                <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mt-4">Bem-vindo ao Clube VIP</p>
                            </div>
                            <p className="text-gray-300 font-medium px-4">Seu acesso foi processado. Você receberá um e-mail com as instruções de resgate assim que sua cortesia oficial for ativada pelo sistema.</p>
                            <button onClick={() => navigate('/status')} className="w-full py-6 bg-primary text-white font-black rounded-3xl shadow-2xl shadow-primary/40 uppercase text-xs tracking-widest transform active:scale-95">MEU STATUS VIP</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClubVipHome;
