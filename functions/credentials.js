
/**
 * Configurações de Integração do Backend.
 * As chaves devem ser configuradas via Firebase CLI:
 * firebase functions:secrets:set ASAAS_API_KEY
 */
export const ASAAS_CONFIG = {
    // Busca a chave primária no segredo do Firebase, ou no objeto estático se definido (não recomendado)
    key: process.env.ASAAS_API_KEY, 
    env: 'production' 
};
