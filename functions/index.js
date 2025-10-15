const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();

/**
 * Sends an email using the Moosend transactional API.
 * @param {string} recipientEmail - The email address of the recipient.
 * @param {string} subject - The subject of the email.
 * @param {string} htmlContent - The HTML body of the email.
 * @throws {functions.https.HttpsError} If config is missing or API call fails.
 */
const sendMoosendEmail = async (recipientEmail, subject, htmlContent) => {
    const moosendConfig = functions.config().moosend;
    if (!moosendConfig || !moosendConfig.key || !moosendConfig.sender_email || !moosendConfig.sender_name) {
        console.error("Moosend config is missing in Firebase environment.", { moosendConfig });
        throw new functions.https.HttpsError('failed-precondition', 'A configuração da API de e-mail (Moosend) não foi encontrada no servidor.');
    }

    const apiUrl = `https://api.moosend.com/v3/transactional/send.json?apiKey=${moosendConfig.key}`;
    const payload = {
        From: `${moosendConfig.sender_name} <${moosendConfig.sender_email}>`,
        To: recipientEmail,
        Subject: subject,
        HtmlBody: htmlContent,
    };

    try {
        const response = await axios.post(apiUrl, payload);
        if (response.status !== 200 || response.data.Error) {
             console.error("Moosend API returned an error:", response.data);
             throw new Error(response.data.Error || "Moosend API error");
        }
        functions.logger.info(`Email sent successfully to ${recipientEmail} via Moosend.`);
    } catch (error) {
        console.error("Failed to send email via Moosend:", error.response ? error.response.data : error.message);
        throw new functions.https.HttpsError('internal', 'Falha na comunicação com a API de e-mail (Moosend).', {
             originalError: error.response ? error.response.data : error.message,
        });
    }
};

exports.getSystemStatus = functions
    .region("southamerica-east1")
    .https.onCall((data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
        }

        const moosendConfig = functions.config().moosend;
        const status = {
            functionVersion: "v2.0-moosend",
            emailProvider: "Moosend",
            configured: false,
            message: "Configuração da API Moosend incompleta ou ausente.",
            details: []
        };

        if (moosendConfig) {
            if (!moosendConfig.key) status.details.push("A variável 'moosend.key' está faltando.");
            if (!moosendConfig.sender_email) status.details.push("A variável 'moosend.sender_email' está faltando.");
            if (!moosendConfig.sender_name) status.details.push("A variável 'moosend.sender_name' está faltando.");

            if (status.details.length === 0) {
                status.configured = true;
                status.message = "API da Moosend configurada corretamente.";
            } else {
                status.message = "Configuração da Moosend incompleta. Verifique as seguintes variáveis de ambiente no Firebase: " + status.details.join(' ');
            }
        } else {
             status.details.push("O grupo de configuração 'moosend' está ausente. Execute 'firebase functions:config:set moosend.key=...' para começar.");
        }

        return status;
    });


exports.sendTestEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth || !context.auth.token.email) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado com um e-mail.');
        }
        const userEmail = 'r3gb0b@gmail.com';
        const testType = data.testType || 'generic'; // Can be 'generic', 'approved', or 'rejected'
        functions.logger.info(`[TEST EMAIL TRIGGER] for user: ${userEmail}, type: ${testType}`);

        try {
            let subject = '';
            let htmlContent = '';
            const orgName = "Organização de Teste";
            const promoterName = "Divulgadora de Teste";
            const campaignName = "Evento de Teste";
            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            const footer = `<hr><p style="font-size: 10px; color: #888;">Este é um e-mail de teste enviado via Moosend.</p>`;


            if (testType === 'approved') {
                subject = `✅ (TESTE) Parabéns! Sua candidatura para ${orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>teste@exemplo.com</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else if (testType === 'rejected') {
                subject = `(TESTE) Resultado da sua candidatura para ${orgName}`;
                const reasonText = String("Este é um motivo de rejeição de teste.\nEle pode ter múltiplas linhas.");
                htmlContent = `
                    <p>Olá, ${promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${campaignName}</strong> da organização <strong>${orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${reasonText.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else { // 'generic'
                subject = "✅ Teste de Envio de E-mail - Equipe Certa";
                htmlContent = `
                    <html><body>
                        <h1>Olá!</h1>
                        <p>Se você está recebendo este e-mail, a integração com o serviço de envio está <strong>funcionando corretamente!</strong> (Teste Genérico)</p>
                        <p>Atenciosamente,<br/>Plataforma Equipe Certa</p>
                        ${footer.replace('Este é um e-mail de teste enviado', 'E-mail enviado')}
                    </body></html>`;
            }

            functions.logger.info(`Sending ${testType} test email to ${userEmail}...`);
            await sendMoosendEmail(userEmail, subject, htmlContent);
            functions.logger.info(`${testType} test email sent successfully via Moosend.`);

            return { success: true, message: `E-mail de teste (${testType}) enviado para ${userEmail}.` };
        } catch (error) {
            functions.logger.error(`FATAL ERROR in sendTestEmail (type: ${testType})`, {
                user: context.auth ? context.auth.token.email : "Unauthenticated",
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                throw error;
            }
            
            const detailedMessage = error.details?.originalError || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";

            throw new functions.https.HttpsError('internal', 'Falha ao enviar e-mail de teste.', {
                originalError: detailedMessage,
            });
        }
    });

exports.sendPromoterStatusEmail = functions
    .region("southamerica-east1")
    .firestore.document('promoters/{promoterId}')
    .onUpdate(async (change, context) => {
        const promoterId = context.params.promoterId;
        
        try {
            const beforeData = change.before.data();
            const afterData = change.after.data();

            if (!beforeData || !afterData || beforeData.status === afterData.status) {
                return null;
            }
            
            functions.logger.info(`[TRIGGER] Promoter update for ${promoterId}. Status: ${beforeData.status} -> ${afterData.status}.`);

            if (beforeData.status !== 'pending' || (afterData.status !== 'approved' && afterData.status !== 'rejected')) {
                functions.logger.info(`[EXIT] Not a final decision from 'pending'. No email needed.`);
                return null;
            }
            
            const finalData = {
                promoterName: String(afterData.name || 'Candidato(a)'),
                campaignName: String(afterData.campaignName || "nossa equipe"),
                recipientEmail: String(afterData.email || ''),
                rejectionReason: String(afterData.rejectionReason || 'Não foi fornecido um motivo específico.'),
                orgName: 'Nossa Equipe',
            };

            if (!finalData.recipientEmail) {
                functions.logger.error(`[FATAL EXIT] Promoter ${promoterId} has no valid email.`);
                return null;
            }
            
            if (afterData.organizationId) {
                try {
                    const orgDoc = await admin.firestore().collection('organizations').doc(String(afterData.organizationId)).get();
                    if (orgDoc.exists) {
                        const orgData = orgDoc.data();
                        if (orgData && orgData.name) {
                            finalData.orgName = String(orgData.name);
                        }
                    }
                } catch (orgError) {
                    functions.logger.warn(`Could not fetch organization name for orgId ${afterData.organizationId}`, orgError);
                }
            }

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';
            const footer = `<hr><p style="font-size: 10px; color: #888;">E-mail enviado via Moosend.</p>`;


            if (afterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${finalData.recipientEmail}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else { // status is 'rejected'
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${finalData.rejectionReason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            }

            await sendMoosendEmail(finalData.recipientEmail, subject, htmlContent);
            
            functions.logger.info(`[SUCCESS] Email dispatched to ${finalData.recipientEmail} for promoter ${promoterId}.`);
            return { success: true };
        } catch (error) {
             functions.logger.error(`[FATAL ERROR] Failed to send promoter status email for promoterId: ${promoterId}.`, {
                rawErrorObject: error,
            });
            return null;
        }
    });

exports.manuallySendStatusEmail = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função só pode ser chamada por um usuário autenticado.');
        }
        const { promoterId } = data;
        if (!promoterId) {
            throw new functions.https.HttpsError('invalid-argument', 'O ID da divulgadora é obrigatório.');
        }

        const provider = "Moosend";
        functions.logger.info(`[MANUAL TRIGGER] for promoterId: ${promoterId} by user: ${context.auth.token.email} via ${provider}`);

        try {
            const promoterDoc = await admin.firestore().collection('promoters').doc(promoterId).get();
            if (!promoterDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'Divulgadora não encontrada.');
            }
            const promoterData = promoterDoc.data();

            if (promoterData.status !== 'approved' && promoterData.status !== 'rejected') {
                throw new functions.https.HttpsError('failed-precondition', 'Só é possível notificar uma candidatura com status "Aprovado" ou "Rejeitado".');
            }

            const finalData = {
                promoterName: String(promoterData.name || 'Candidato(a)'),
                campaignName: String(promoterData.campaignName || "nossa equipe"),
                recipientEmail: String(promoterData.email || ''),
                rejectionReason: String(promoterData.rejectionReason || 'Não foi fornecido um motivo específico.'),
                orgName: 'Nossa Equipe',
            };
            
            if (!finalData.recipientEmail) {
                 throw new functions.https.HttpsError('failed-precondition', 'A divulgadora não possui um e-mail válido.');
            }
            
            if (promoterData.organizationId) {
                try {
                    const orgDoc = await admin.firestore().collection('organizations').doc(String(promoterData.organizationId)).get();
                    if (orgDoc.exists) {
                        const orgData = orgDoc.data();
                        if (orgData && orgData.name) {
                            finalData.orgName = String(orgData.name);
                        }
                    }
                } catch (orgError) {
                    functions.logger.warn(`Could not fetch organization name for orgId ${promoterData.organizationId}`, orgError);
                }
            }

            const portalLink = `https://stingressos-e0a5f.web.app/#/status`;
            let subject = '';
            let htmlContent = '';
            const footer = `<hr><p style="font-size: 10px; color: #888;">E-mail enviado via Moosend.</p>`;


            if (promoterData.status === 'approved') {
                subject = `✅ Parabéns! Sua candidatura para ${finalData.orgName} foi aprovada!`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName}!</p>
                    <p>Temos uma ótima notícia! Sua candidatura para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong> foi APROVADA.</p>
                    <p>Para continuar, acesse seu portal para ler as regras e obter o link do grupo oficial.</p>
                    <p><a href="${portalLink}" style="font-weight: bold; color: #e83a93;">Clique aqui para acessar seu portal</a></p>
                    <p>Lembre-se de usar o e-mail <strong>${finalData.recipientEmail}</strong> para consultar seu status.</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            } else { // status is 'rejected'
                subject = `Resultado da sua candidatura para ${finalData.orgName}`;
                htmlContent = `
                    <p>Olá, ${finalData.promoterName},</p>
                    <p>Agradecemos o seu interesse em fazer parte da equipe para <strong>${finalData.campaignName}</strong> da organização <strong>${finalData.orgName}</strong>.</p>
                    <p>Analisamos seu perfil e, neste momento, não poderemos seguir com a sua candidatura.</p>
                    <p><strong>Motivo informado:</strong><br/>${finalData.rejectionReason.replace(/\n/g, '<br/>')}</p>
                    <p>Desejamos sucesso em suas futuras oportunidades!</p>
                    <p>Atenciosamente,<br/>Equipe Certa</p>
                    ${footer}
                `;
            }
            
            await sendMoosendEmail(finalData.recipientEmail, subject, htmlContent);
            functions.logger.info(`[SUCCESS] Manual email sent to ${finalData.recipientEmail} for promoter ${promoterId}.`);

            return { success: true, message: `E-mail enviado com sucesso para ${finalData.recipientEmail}.`, provider };
        } catch (error) {
            functions.logger.error("FATAL ERROR in manuallySendStatusEmail", {
                promoterId: data.promoterId,
                user: context.auth.token.email,
                rawErrorObject: error,
            });

            if (error instanceof functions.https.HttpsError) {
                // Add provider to the error details if it's our custom HttpsError
                if (error.details) {
                    error.details.provider = provider;
                } else {
                    error.details = { provider };
                }
                throw error;
            }
            
            const detailedMessage = error.details?.originalError || error.message || "Ocorreu um erro desconhecido no servidor de e-mails.";

            throw new functions.https.HttpsError('internal', 'Falha na API de envio de e-mail.', {
                originalError: detailedMessage,
                provider,
            });
        }
    });

exports.askGemini = functions
    .region("southamerica-east1")
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
        }

        const prompt = data.prompt;
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new functions.https.HttpsError('invalid-argument', 'O comando (prompt) não pode estar vazio.');
        }

        const geminiConfig = functions.config().gemini;
        if (!geminiConfig || !geminiConfig.key) {
            console.error("Gemini API key is missing in Firebase environment.", { geminiConfig });
            throw new functions.https.HttpsError('failed-precondition', 'A chave da API Gemini não foi configurada no servidor.');
        }

        try {
            const ai = new GoogleGenAI({ apiKey: geminiConfig.key });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            // Check for prompt feedback and blocking reasons first.
            if (response.promptFeedback?.blockReason) {
                const blockReason = response.promptFeedback.blockReason;
                const safetyRatings = response.promptFeedback.safetyRatings;
                const errorMessage = `Sua solicitação foi bloqueada por motivos de segurança: ${blockReason}.`;
                
                console.warn("Gemini API request was blocked.", { blockReason, safetyRatings });
                
                // Use 'invalid-argument' as the user's prompt was the cause.
                throw new functions.https.HttpsError('invalid-argument', errorMessage, {
                    blockReason,
                    safetyRatings,
                });
            }
            
            const text = response.text;
            
            if (text === undefined || text === null || text.trim() === '') {
                 const finishReason = response.candidates?.[0]?.finishReason;
                 console.warn("Gemini API returned a response with no text.", { finishReason, response });
                 if (finishReason && finishReason !== 'STOP') {
                     throw new functions.https.HttpsError('internal', `A API finalizou a geração por um motivo inesperado: ${finishReason}.`);
                 }
            }

            return { text: text || '' };

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            // Make the error message more user-friendly for common issues.
            let userMessage = 'Ocorreu um erro ao se comunicar com o assistente de IA.';
            const originalMessage = error.message || '';

            if (originalMessage.toLowerCase().includes('api key not valid')) {
                userMessage = 'A chave da API Gemini configurada no servidor é inválida. Verifique suas credenciais no Firebase.';
            } else if (originalMessage.includes('billing') || originalMessage.includes('project has been disabled')) {
                userMessage = 'O projeto do Google Cloud associado não tem faturamento ativo ou foi desativado.';
            } else if (error.code === 'invalid-argument') {
                // This is our own error from the block reason check. Pass it through.
                userMessage = originalMessage;
            }
            
            // Re-throw with a structured error.
            throw new functions.https.HttpsError('internal', userMessage, {
                originalError: error.toString(),
            });
        }
    });