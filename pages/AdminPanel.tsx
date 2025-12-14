            const updateData = { lastManualNotificationAt: firebase.firestore.FieldValue.serverTimestamp() };
            await updatePromoter(promoter.id, updateData);

        } catch (error: any) {
            console.error("Failed to send manual notification:", error);
            let detailedError = 'Ocorreu um erro desconhecido.';
            let providerName = 'Brevo (v9.2)';

            if (error && typeof error === 'object') {
                if (error.details) {
                    const rawError = error.details.detailedError || error.details.originalError?.message || error.message;
                    if (rawError) {
                        detailedError = String(rawError);
                    }
                    if (error.details.provider) {
                        providerName = error.details.provider;
                    }
                } else if (error.message) {
                    detailedError = error.message;
                }
            } else {
                detailedError = String(error);
            }
            
            alert(`Falha ao enviar notificação: ${detailedError} (Tentativa via: ${providerName})`);
        } finally {
            setNotifyingId(null);
        }
    };

    const handleRemoveFromTeam = async (promoter: Promoter) => {