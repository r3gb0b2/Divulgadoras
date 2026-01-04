import React, { useEffect, useRef } from 'react';
/* Added CheckCircleIcon to imports to fix "Cannot find name 'CheckCircleIcon'" error and removed unused TicketIcon */
import { LogoIcon, SparklesIcon, CalendarIcon, CheckCircleIcon } from './Icons';
import { VipMembership } from '../types';

interface VipTicketProps {
    membership: VipMembership;
    onClose: () => void;
}

const VipTicket: React.FC<VipTicketProps> = ({ membership, onClose }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (qrRef.current && membership.benefitCode) {
            qrRef.current.innerHTML = '';
            new (window as any).QRCode(qrRef.current, {
                text: membership.benefitCode,
                width: 140,
                height: 140,
                colorDark: "#ffffff",
                colorLight: "rgba(0,0,0,0)",
                correctLevel: (window as any).QRCode.CorrectLevel.H
            });
        }
    }, [membership.benefitCode]);

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="w-full max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                {/* BOTÃO FECHAR */}
                <div className="flex justify-end mb-4">
                    <button onClick={onClose} className="text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors">Fechar [X]</button>
                </div>

                {/* CORPO DO INGRESSO */}
                <div className="relative bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    
                    {/* PARTE SUPERIOR (LOGO E CABEÇALHO) */}
                    <div className="bg-gradient-to-br from-primary via-primary-dark to-zinc-900 p-8 text-center border-b border-white/5 relative">
                        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                        <LogoIcon className="h-10 mx-auto mb-4 relative z-10 brightness-200" />
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 relative z-10 mb-2">
                            <SparklesIcon className="w-3 h-3 text-accent" />
                            <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Credential VIP Official</span>
                        </div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tighter relative z-10 leading-none">
                            {membership.vipEventName}
                        </h1>
                    </div>

                    {/* RECORTE LATERAL (CÍRCULOS) */}
                    <div className="absolute left-[-15px] top-[45%] w-8 h-8 bg-black rounded-full border-r border-white/10 z-20"></div>
                    <div className="absolute right-[-15px] top-[45%] w-8 h-8 bg-black rounded-full border-l border-white/10 z-20"></div>
                    
                    {/* LINHA PONTILHADA */}
                    <div className="border-t-2 border-dashed border-zinc-800 w-full absolute top-[48%] opacity-50"></div>

                    {/* PARTE INFERIOR (DADOS E QR) */}
                    <div className="p-8 pt-12 space-y-8 text-center bg-zinc-900">
                        
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em]">Titular do Ingresso</p>
                            <h2 className="text-xl font-black text-white uppercase truncate px-4">{membership.promoterName}</h2>
                        </div>

                        <div className="flex justify-center">
                            <div className="p-4 bg-white/5 rounded-3xl border border-white/10 shadow-inner">
                                <div ref={qrRef} className="bg-transparent"></div>
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <p className="text-[10px] font-mono font-black text-primary tracking-[0.5em]">{membership.benefitCode}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                            <div className="text-left">
                                <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Emitido em</p>
                                <div className="flex items-center gap-2 text-gray-300">
                                    <CalendarIcon className="w-3 h-3 text-primary" />
                                    <span className="text-[10px] font-bold uppercase">{new Date().toLocaleDateString('pt-BR')}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-gray-600 uppercase mb-1">Status</p>
                                <div className="flex items-center justify-end gap-2 text-green-400">
                                    {/* Component CheckCircleIcon is now correctly imported */}
                                    <CheckCircleIcon className="w-3 h-3" />
                                    <span className="text-[10px] font-black uppercase">Validado</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4">
                            <p className="text-[8px] text-gray-600 uppercase font-black leading-relaxed">
                                Este ingresso é pessoal e intransferível.<br/>
                                Apresente o QR Code na entrada para validação.
                            </p>
                        </div>
                    </div>
                </div>

                <p className="mt-6 text-center text-gray-500 text-[10px] font-black uppercase tracking-widest animate-pulse">
                    Tire um Print desta tela agora
                </p>
            </div>
        </div>
    );
};

export default VipTicket;