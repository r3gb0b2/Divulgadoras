    const handleLookupPromoter = async (emailToSearch?: string) => {
        const email: string = emailToSearch || lookupEmail;
        if (!email.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(email.trim());
            setLookupResults(results);
        } catch (err: any) {
            let errorMessage = "Ocorreu um erro na busca.";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else {
                errorMessage = String(err);
            }
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };