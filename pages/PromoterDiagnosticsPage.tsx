import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { getAssignmentsForPromoterByEmail } from '../services/postService';
import { getGuestListConfirmationsByEmail } from '../services/guestListService';
import { Promoter, PostAssignment, GuestListConfirmation } from '../types';
import { ArrowLeftIcon, SearchIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const PromoterDiagnosticsPage: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<{
        profiles: Promoter[];
        assignments: PostAssignment[];
        guestLists: GuestListConfirmation[];
    } | null>(null);
    const [expandedJson, setExpandedJson] = useState<Record<string, boolean>>({});

    const handleSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail.trim()) return;
        setIsLoading(true);
        setError(null);
        setResults(null);
        setExpandedJson({});
        try {
            const [profiles, assignments, guestLists] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getGuestListConfirmationsByEmail(searchEmail)
            ]);
            setResults({ profiles, assignments, guestLists });
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao buscar os dados.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(email);
    };

    const toggleJson = (key: string) => {
        setExpandedJson(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const renderJson = (data: any) => (
        <pre className="text-xs bg-black/50 p-3 rounded-md mt-2 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
            {JSON.stringify(data, (key, value) => {
                // Pretty print Firestore Timestamps
                if (value && typeof value === 'object' && value.seconds !== undefined && value.nanoseconds !== undefined) {
                    return new Date(value.seconds * 1000).toISOString();
                }
                return value;
            }, 2)}
        </pre>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                 <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar ao Dashboard</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Diagnóstico de Divulgadora</h1>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Insira o e-mail de uma divulgadora para buscar todos os seus dados no banco de dados, incluindo cadastros, tarefas e listas.
                </p>
                <form onSubmit={handleSubmit} className="flex gap-4">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="E-mail da divulgadora"
                        className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        required
                    />
                    <button type="submit" disabled={isLoading} className="flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark font-semibold disabled:opacity-50">
                        <SearchIcon className="w-5 h-5"/>
                        {isLoading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>

                <div className="mt-8">
                    {isLoading && <div className="text-center py-8">Carregando dados...</div>}
                    {error && <p className="text-red-400 text-center py-8">{error}</p>}
                    {results && (
                        <div className="space-y-6">
                            {/* Promoter Profiles */}
                            <section>
                                <h2 className="text-xl font-semibold text-white mb-3">Registros de Cadastro ({results.profiles.length})</h2>
                                {results.profiles.length === 0 ? <p className="text-gray-500">Nenhum registro encontrado.</p> : (
                                    <div className="space-y-3">
                                        {results.profiles.map((p, index) => (
                                            <div key={p.id} className="bg-dark/70 p-3 rounded-lg">
                                                <p><strong>{p.name}</strong> para <strong>{p.campaignName || 'Geral'}</strong> ({p.state})</p>
                                                <p className="text-sm text-gray-400">Status: {p.status} | Criado em: {(p.createdAt as Timestamp)?.toDate().toLocaleString('pt-BR')}</p>
                                                <button onClick={() => toggleJson(`profile-${index}`)} className="text-xs text-blue-400 hover:underline mt-2">
                                                    {expandedJson[`profile-${index}`] ? 'Ocultar' : 'Ver'} Dados Brutos (JSON)
                                                </button>
                                                {expandedJson[`profile-${index}`] && renderJson(p)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* Post Assignments */}
                            <section>
                                <h2 className="text-xl font-semibold text-white mb-3">Tarefas de Postagem ({results.assignments.length})</h2>
                                 {results.assignments.length === 0 ? <p className="text-gray-500">Nenhuma tarefa encontrada.</p> : (
                                    <div className="space-y-3">
                                        {results.assignments.map((a, index) => (
                                            <div key={a.id} className="bg-dark/70 p-3 rounded-lg">
                                                <p>Tarefa para <strong>{a.post.campaignName}</strong> (ID do Post: {a.postId.substring(0, 5)}...)</p>
                                                <p className="text-sm text-gray-400">Status: {a.status} | Comprovação: {a.proofSubmittedAt ? 'Sim' : 'Não'}</p>
                                                 <button onClick={() => toggleJson(`assignment-${index}`)} className="text-xs text-blue-400 hover:underline mt-2">
                                                    {expandedJson[`assignment-${index}`] ? 'Ocultar' : 'Ver'} Dados Brutos (JSON)
                                                </button>
                                                {expandedJson[`assignment-${index}`] && renderJson(a)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>

                             {/* Guest Lists */}
                            <section>
                                <h2 className="text-xl font-semibold text-white mb-3">Confirmações em Listas ({results.guestLists.length})</h2>
                                 {results.guestLists.length === 0 ? <p className="text-gray-500">Nenhuma confirmação encontrada.</p> : (
                                    <div className="space-y-3">
                                        {results.guestLists.map((g, index) => (
                                            <div key={g.id} className="bg-dark/70 p-3 rounded-lg">
                                                <p>Lista <strong>{g.listName}</strong> para <strong>{g.campaignName}</strong></p>
                                                <p className="text-sm text-gray-400">Convidados: {(g.guests || []).length} | Confirmado em: {(g.confirmedAt as Timestamp)?.toDate().toLocaleString('pt-BR')}</p>
                                                 <button onClick={() => toggleJson(`guestlist-${index}`)} className="text-xs text-blue-400 hover:underline mt-2">
                                                    {expandedJson[`guestlist-${index}`] ? 'Ocultar' : 'Ver'} Dados Brutos (JSON)
                                                </button>
                                                {expandedJson[`guestlist-${index}`] && renderJson(g)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PromoterDiagnosticsPage;