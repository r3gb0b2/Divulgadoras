
/**
 * Configurações de Integração do Backend.
 */
export const ASAAS_CONFIG = {
    key: process.env.ASAAS_API_KEY, 
    env: 'production' 
};

export const PAGARME_CONFIG = {
    key: process.env.PAGARME_SECRET_KEY,
    // Note: No Pagar.me V5, usamos orders. 
    // Certifique-se de configurar a Secret Key no Firebase Secrets
};
