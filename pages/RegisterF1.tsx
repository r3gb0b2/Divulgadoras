
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addPromoter } from '../services/promoterService';
import { UserIcon, MailIcon, PhoneIcon, InstagramIcon, CalendarIcon, CameraIcon, ArrowLeftIcon, CheckCircleIcon } from '../components/Icons';
import { states } from '../constants/states';

const RegisterF1: React.FC = () => {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        whatsapp: '',
        instagram: '',
        dateOfBirth: '',
        state: 'CE',
    });
    
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files) as File[];
            setPhotos(files);
            setPreviews(files.map(f => URL.createObjectURL(f as Blob)));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (photos.length === 0) {
            setError("Por favor, envie ao menos uma foto.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await addPromoter({
                ...formData,
                photos,
                tiktok: '',
                organizationId: 'stingressos-f1',
                campaignName: 'Divulgadora F1'
            });

            // PERSISTE O E-MAIL APÓS O CADASTRO
            localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());

            setSuccess(true);
            setTimeout(() => navigate('/status'), 4000);
        } catch (err: any) {
            setError(err.message || "Erro ao salvar cadastro.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-md mx-auto text-center py-20 animate-fadeIn">
                <div className="bg-secondary p-10 rounded-3xl shadow-2xl border border-green-500/30">
                    <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white mb-4">Sucesso!</h1>
                    <p className="text-gray-400">Seu cadastro para a equipe F1 foi recebido. Nossa equipe analisará seu perfil em breve.</p>
                    <button onClick={() => navigate('/status')} className="mt-8 px-8 py-3 bg-primary text-white font-bold rounded-full">Ver meu Status</button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
                <ArrowLeftIcon className="w-5 h-5" /> <span>Voltar</span>
            </button>

            <div className="bg-secondary shadow-2xl rounded-3xl overflow-hidden border border-gray-800">
                <div className="bg-primary/20 p-8 text-center border-b border-gray-800">
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Equipe <span className="text-primary">F1</span></h1>
                    <p className="text-gray-400 mt-2 font-medium tracking-wide">Cadastro Oficial de Divulgadoras</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {error && <div className="bg-red-900/40 border border-red-800 text-red-200 p-4 rounded-xl text-sm">{error}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome Completo</label>
                            <div className="relative">
                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input name="name" required onChange={handleChange} className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" placeholder="Como no RG" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">E-mail</label>
                            <div className="relative">
                                <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input type="email" name="email" required onChange={handleChange} className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" placeholder="exemplo@gmail.com" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">WhatsApp</label>
                            <div className="relative">
                                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input type="tel" name="whatsapp" required onChange={handleChange} className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" placeholder="(00) 00000-0000" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Instagram</label>
                            <div className="relative">
                                <InstagramIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input name="instagram" required onChange={handleChange} className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" placeholder="@seuusuario" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nascimento</label>
                            <div className="relative">
                                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                <input type="date" name="dateOfBirth" required onChange={handleChange} className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase ml-1">Estado</label>
                            <select name="state" value={formData.state} onChange={handleChange} className="w-full px-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none">
                                {states.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="pt-4">
                        <label className="block text-sm font-bold text-gray-400 uppercase mb-4">Fotos de Perfil (Corpo e Rosto)</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-2xl hover:border-primary transition-all cursor-pointer bg-gray-800/30">
                                <CameraIcon className="w-8 h-8 text-primary mb-2" />
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Anexar</span>
                                <input type="file" multiple accept="image/*" onChange={handleFileChange} className="hidden" />
                            </label>
                            {previews.map((src, idx) => (
                                <img key={idx} src={src} className="aspect-square w-full object-cover rounded-2xl border border-gray-700" alt="Preview" />
                            ))}
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full py-5 bg-primary text-white font-black text-xl rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                        {isSubmitting ? 'ENVIANDO...' : 'FINALIZAR CADASTRO F1'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default RegisterF1;
