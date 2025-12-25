
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addPromoter } from '../services/promoterService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon, SparklesIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, MegaphoneIcon
} from '../components/Icons';
import { states } from '../constants/states';

const PublicRegistration: React.FC = () => {
  const navigate = useNavigate();
  const { organizationId = 'default', state = 'CE' } = useParams();
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    dateOfBirth: '',
    state: state,
  });
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const totalPhotos = [...photos, ...filesArray].slice(0, 8);
      setPhotos(totalPhotos);
      setPreviews(totalPhotos.map(file => URL.createObjectURL(file as Blob)));
      setError(null);
    }
  };

  const removePhoto = (index: number) => {
    const newFiles = photos.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setPhotos(newFiles);
    setPreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photos.length < 1) {
      setError("Por favor, envie pelo menos uma foto para análise.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addPromoter({
        ...formData,
        photos,
        tiktok: '',
        organizationId: organizationId,
        campaignName: 'Cadastro Geral'
      });
      
      setIsSuccess(true);
      setTimeout(() => { navigate('/status'); }, 4000);
    } catch (err: any) {
      setError(err.message || "Erro ao processar cadastro.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-in fade-in zoom-in duration-500">
        <div className="bg-secondary/60 backdrop-blur-3xl p-12 rounded-[3rem] border border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.1)]">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircleIcon className="w-14 h-14 text-green-500" />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Inscrição Enviada!</h1>
          <p className="text-gray-300 text-lg mb-8 leading-relaxed">Seu perfil entrou na nossa fila de análise VIP. Em breve você receberá um retorno.</p>
          <button onClick={() => navigate('/status')} className="px-8 py-4 bg-primary text-white font-black rounded-2xl uppercase tracking-widest text-xs hover:scale-105 transition-all">Ver meu Status</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="relative">
        {/* Background Decorative Elements */}
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/20 rounded-full blur-[100px] -z-10 animate-pulse"></div>
        <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] -z-10"></div>

        <div className="bg-secondary/40 backdrop-blur-2xl shadow-[0_32px_64px_rgba(0,0,0,0.5)] rounded-[3.5rem] overflow-hidden border border-white/5">
          <div className="bg-gradient-to-br from-primary/40 via-secondary to-transparent p-12 text-center border-b border-white/5">
            <h1 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4">
              Seja uma <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Divulgadora</span>
            </h1>
            <p className="text-gray-400 font-bold uppercase tracking-[0.3em] text-[10px]">Portal de Inscrição Exclusive</p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 md:p-16 space-y-12">
            {error && (
              <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center flex items-center justify-center gap-3 animate-bounce">
                <XIcon className="w-5 h-5 text-red-500" /> {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              {/* Coluna 1: Dados */}
              <div className="space-y-8">
                <div className="flex items-center gap-4 border-l-4 border-primary pl-4">
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Dados Pessoais</h2>
                </div>
                
                <div className="space-y-4">
                  <div className="relative group">
                    <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <input 
                      type="text" placeholder="Nome Completo" 
                      className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required
                    />
                  </div>

                  <div className="relative group">
                    <MailIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <input 
                      type="email" placeholder="E-mail principal" 
                      className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required
                    />
                  </div>

                  <div className="relative group">
                    <PhoneIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                    <input 
                      type="tel" placeholder="WhatsApp (DDD + Número)" 
                      className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                      value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative group">
                      <InstagramIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                      <input 
                        type="text" placeholder="Instagram" 
                        className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                        value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} required
                      />
                    </div>
                    <div className="relative group">
                      <CalendarIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                      <input 
                        type="date" 
                        className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary outline-none transition-all font-medium"
                        value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} required
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Coluna 2: Fotos */}
              <div className="space-y-8">
                <div className="flex items-center justify-between border-l-4 border-purple-500 pl-4">
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Suas Melhores Fotos</h2>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{photos.length}/8</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {previews.map((url, i) => (
                    <div key={i} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl group animate-in zoom-in duration-300">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button 
                        type="button" onClick={() => removePhoto(i)}
                        className="absolute top-3 right-3 bg-red-600/80 backdrop-blur-md text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-600 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  
                  {photos.length < 8 && (
                    <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] bg-white/5 hover:bg-white/10 hover:border-primary transition-all cursor-pointer group">
                      <CameraIcon className="w-12 h-12 text-gray-600 group-hover:text-primary mb-3 transition-transform group-hover:scale-110" />
                      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest group-hover:text-primary">Adicionar Foto</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 text-center italic">Envie fotos nítidas (rosto e corpo) para aumentar suas chances.</p>
              </div>
            </div>

            <div className="pt-10">
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-6 bg-gradient-to-r from-primary to-purple-600 text-white font-black text-2xl rounded-3xl shadow-[0_20px_50px_rgba(126,57,213,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-4 uppercase tracking-tighter"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    Enviando Perfil...
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-7 h-7" />
                    Finalizar Inscrição VIP
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PublicRegistration;
