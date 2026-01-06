
import React, { useEffect, useRef } from 'react';
import { LogoIcon, ClockIcon, MapPinIcon } from './Icons';
import { VipMembership } from '../types';

interface GreenlifeTicketProps {
    membership: VipMembership;
    onClose?: () => void;
    isExporting?: boolean;
}

const GreenlifeTicket: React.FC<GreenlifeTicketProps> = ({ membership, onClose, isExporting = false }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (qrRef.current && membership.benefitCode) {
            qrRef.current.innerHTML = '';
            new (window as any).QRCode(qrRef.current, {
                text: membership.benefitCode,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: (window as any).QRCode.CorrectLevel.H
            });
        }
    }, [membership.benefitCode]);

    const ticketStyle = isExporting 
        ? { width: '400px', height: '700px', margin: '0' } 
        : { width: '100%', maxWidth: '380px' };

    const content = (
        <div id={`greenlife-ticket-${membership.id}`} className="relative bg-white rounded-[3rem] overflow-hidden shadow-2xl flex flex-col border-4 border-green-500" style={ticketStyle}>
            <div className="bg-green-600 p-10 text-center relative border-b-4 border-dashed border-gray-200">
                <div className="relative z-10 flex flex-col items-center">
                    <LogoIcon width="200" height="40" className="text-white brightness-200 mb-4" />
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter leading-none mb-1">{membership.vipEventName}</h1>
                    <p className="text-green-100 text-[9px] font-black uppercase tracking-[0.3em]">ALUNO GREENLIFE CREDENCIADO</p>
                </div>
            </div>

            <div className="p-8 pt-6 flex-grow flex flex-col justify-between text-center bg-white">
                <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.4em]">ALUNO(A)</p>
                    <h2 className="text-2xl font-black text-gray-900 uppercase truncate">{membership.promoterName}</h2>
                </div>

                <div className="flex justify-center my-6">
                    <div className="p-4 bg-gray-50 rounded-[2.5rem] border-2 border-green-100 shadow-inner">
                        <div ref={qrRef}></div>
                        <div className="mt-4 pt-3 border-t border-gray-100">
                            <p className="text-lg font-mono font-black text-green-600 tracking-[0.4em]">{membership.benefitCode}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y border-gray-100 mb-4">
                    <div className="text-center border-r border-gray-100 px-2">
                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1 tracking-widest">Horário</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-700">
                            <ClockIcon className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] font-black uppercase">{membership.eventTime || 'Horário de Treino'}</span>
                        </div>
                    </div>
                    <div className="text-center px-2">
                        <p className="text-[8px] font-black text-gray-400 uppercase mb-1 tracking-widest">Unidade</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-700">
                            <MapPinIcon className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] font-black uppercase">{membership.eventLocation || 'Greenlife'}</span>
                        </div>
                    </div>
                </div>

                <p className="text-[8px] text-gray-400 uppercase font-black tracking-[0.2em]">ALUNOS GREENLIFE • ACESSO EXCLUSIVO</p>
            </div>
        </div>
    );

    if (isExporting) return content;

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="w-full max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
                <div className="flex justify-end mb-4">
                    <button onClick={onClose} className="text-white font-black uppercase text-[10px] bg-green-600 px-4 py-2 rounded-full">Fechar [X]</button>
                </div>
                {content}
            </div>
        </div>
    );
};

export default GreenlifeTicket;
