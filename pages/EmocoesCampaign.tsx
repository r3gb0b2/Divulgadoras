
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail, createVipPromoter } from '../services/promoterService';
import { getActiveVipEvents, checkVipMembership } from '../services/vipService';
import { Promoter, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
  ArrowLeftIcon, CheckCircleIcon, SparklesIcon,
  DocumentDuplicateIcon, RefreshIcon, UserIcon, PhoneIcon, InstagramIcon
} from '../components/Icons';

type CampaignStep = 'select_event' | 'benefits' | 'identify' | 'register_new' | 'payment' | 'success';

const EmocoesCampaign: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('select_event');
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<VipEvent | null>(null);
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
            setError("Falha ao carregar eventos VIP.");
            setIsLoading(false);
        });
    }, []);

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
            if (profiles.length > 0) {
                const p = profiles[0];
                const membership = await checkVipMembership(trimmedEmail, selectedEvent.id);
                
                if (membership?.status === 'confirmed') {
                    setError("Você já é um Membro VIP deste evento!");
                    setIsLoading(false);
                    return;
                }
                
                // Pedimos confirmação/preenchimento dos dados de contato para o VIP
                setName(p.name);
                setWhatsapp(p.whatsapp);
                setInstagram(p.instagram);
                setPromoter(p);
                setStep('register_new');
                setIsLoading(false);
            } else {
                // Usuário novo
                setPromoter(null);
                setName('');
                setWhatsapp('');
                setInstagram('');
                setStep('register_new');
                setIsLoading(false);
            }
        } catch (err: any) {
            setError("Erro ao verificar e-mail: " + err.message);
            setIsLoading(false);
        }
    };

    const handleCreateNewAndPay = async (e: React.FormEvent) => {
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
            
            // Atualiza os dados no perfil (divulgadora)
            await firestore.collection('promoters').doc(pId).update({
                whatsapp: sanitizedWhatsapp,
                instagram: sanitizedInstagram
            });

            const p = { id: pId, name, email, whatsapp: sanitizedWhatsapp, instagram: sanitizedInstagram } as Promoter;
            setPromoter(p);
            generatePayment(p, selectedEvent);
        } catch (err: any) {
            setError("Erro ao processar cadastro: " + err.message);
            setIsLoading(false);
        }
    };

    const generatePayment = async (p: Promoter, ev: VipEvent) => {
        setIsLoading(true);
        try {
            const createPix = httpsCallable(functions, 'createVipPixPayment');
            const res: any = await createPix({
                vipEventId: ev.id,
                promoterId: p.id,
                email: p.email,
                name: p.name,
                whatsapp: p.whatsapp,
                instagram: p.instagram,
                amount: ev.price
            });
            setPixData(res.data);
            setStep('payment');
        } catch (err: any) {
            setError("Erro ao gerar pagamento: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => step === 'select_event' ? navigate(-1) : setStep('select_event')} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 p-10 text-center">
                    <SparklesIcon className="w-12 h-12 text-primary mx-auto mb-4" />
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Clube <span className="text-primary">VIP</span></h1>
                </div>

                <div className="p-8">
                    {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-300 rounded-2xl text-xs font-bold text-center">{error}</div>}

                    {step === 'select_event' && (
                        <div className="grid gap-4">
                            {events.map(ev => (
                                <button key={ev.id} onClick={() => { setSelectedEvent(ev); setStep('benefits'); }} className="bg-dark/40 p-6 rounded-3xl border border-white/5 hover:border-primary text-left transition-all group">
                                    <p className="text-white font-black text-lg uppercase group-hover:text-primary transition-colors">{ev.name}</p>
                                    <p className="text-primary font-black text-xl">R$ {ev.price.toFixed(2).replace('.', ',')}</p>
                                </button>
                            ))}
                        </div>
                    )}

                    {step === 'benefits' && (
                        <div className="space-y-6">
                            <h2 className="text-2xl font-black text-white uppercase">{selectedEvent?.name}</h2>
                            <div className="grid gap-3">
                                {selectedEvent?.benefits.map((b, i) => (
                                    <div key={i} className="flex gap-3 text-gray-300 text-sm bg-dark/20 p-3 rounded-xl border border-white/5">
                                        <CheckCircleIcon className="w-5 h-5 text-green-500" /> {b}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setStep('identify')} className="w-full py-5 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark shadow-xl shadow-primary/20">AVANÇAR</button>
                        </div>
                    )}

                    {step === 'identify' && (
                        <form onSubmit={handleCheckEmail} className="space-y-4">
                            <h2 className="text-xl font-black text-white text-center uppercase">Identificação</h2>
                            <input 
                                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                className="w-full p-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                placeholder="Seu e-mail"
                            />
                            <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-2xl">
                                {isLoading ? 'VERIFICANDO...' : 'AVANÇAR'}
                            </button>
                        </form>
                    )}

                    {step === 'register_new' && (
                        <form onSubmit={handleCreateNewAndPay} className="space-y-4">
                            <h2 className="text-xl font-black text-white text-center uppercase">Seus Dados de Acesso</h2>
                            <p className="text-center text-gray-400 text-[10px] mb-4 uppercase font-bold tracking-widest">Precisamos de seus contatos para liberar o cupom VIP.</p>
                            <div className="relative">
                                <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input 
                                    type="text" required value={name} onChange={e => setName(e.target.value)}
                                    className="w-full p-5 pl-14 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                    placeholder="Nome Completo"
                                />
                            </div>
                            <div className="relative">
                                <PhoneIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input 
                                    type="tel" required value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                                    className="w-full p-5 pl-14 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                    placeholder="WhatsApp com DDD"
                                />
                            </div>
                            <div className="relative">
                                <InstagramIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input 
                                    type="text" required value={instagram} onChange={e => setInstagram(e.target.value)}
                                    className="w-full p-5 pl-14 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                    placeholder="Instagram (usuário)"
                                />
                            </div>
                            <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20">
                                {isLoading ? 'PROCESSANDO...' : 'PROSSEGUIR PARA PAGAMENTO'}
                            </button>
                        </form>
                    )}

                    {step === 'payment' && pixData && (
                        <div className="space-y-8 text-center animate-fadeIn">
                            <p className="text-white font-black text-sm uppercase tracking-widest">Aguardando Pagamento...</p>
                            <div className="bg-white p-4 rounded-3xl inline-block mx-auto shadow-2xl">
                                <img src={`data:image/jpeg;base64,${pixData.qr_code_base64}`} alt="QR Code Pix" className="w-48 h-48" />
                            </div>
                            
                            <div className="bg-dark/60 p-6 rounded-3xl border border-white/5 space-y-4">
                                <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Código Copia e Cola</p>
                                <div className="flex gap-2">
                                    <input readOnly value={pixData.qr_code} className="bg-dark p-3 rounded-xl text-[10px] text-gray-400 font-mono flex-grow border border-white/5" />
                                    <button onClick={() => { navigator.clipboard.writeText(pixData.qr_code); alert("Pix Copiado!"); }} className="p-3 bg-primary text-white rounded-xl">
                                        <DocumentDuplicateIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-center gap-3 py-4 text-blue-400 font-bold animate-pulse">
                                <RefreshIcon className="w-5 h-5 animate-spin" />
                                <span className="text-xs uppercase tracking-tighter">O sistema irá detectar seu pagamento automaticamente</span>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center py-10 space-y-6 animate-fadeIn">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircleIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">ADESÃO RECEBIDA!</h2>
                            <p className="text-gray-400">Seu cupom está sendo gerado e aguarda ativação pelo administrador. Em breve você receberá um alerta push.</p>
                            <button onClick={() => navigate('/status')} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 uppercase text-xs tracking-widest">VER MEU STATUS VIP</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmocoesCampaign;
