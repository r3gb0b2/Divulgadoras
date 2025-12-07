    const handleLookupPromoter = async (emailToSearch?: string) => {
        const email = (typeof emailToSearch === 'string' ? emailToSearch : '') || lookupEmail;
        if (!email.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(String(email).trim());
            setLookupResults(results);
        } catch (err: unknown) {
            let errorMessage = "Ocorreu um erro na busca.";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'string') {
                errorMessage = err;
            }
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };