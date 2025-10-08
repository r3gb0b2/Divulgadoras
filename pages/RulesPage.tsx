import React from 'react';
import { InstagramIcon } from '../components/Icons';

const RulesPage: React.FC = () => {
  const whatsappGroupLink = 'https://chat.whatsapp.com/Dd3ztUQsQjc2hlsXldHFLe';
  const instagramProfileLink = 'https://instagram.com/rafaelmacciel';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-4">Regras para Divulgadoras</h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Leia com atenção para garantir uma boa parceria.</p>

        <div className="space-y-6 text-gray-700 dark:text-gray-300">
          
          <div className="p-4 border rounded-lg dark:border-gray-700">
            <h2 className="text-xl font-semibold text-primary mb-3">1. Envio de Prints</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-bold">Story:</span> Enviar print com pelo menos <span className="font-bold text-primary-dark dark:text-primary">5 horas</span> de postagem. Deixe o story apagar sozinho (não apague antes das 24h).</li>
              <li><span className="font-bold">Feed:</span> Após <span className="font-bold text-primary-dark dark:text-primary">48 horas</span> da postagem, envie o print. Depois disso, você pode apagar a postagem.</li>
              <li><span className="font-bold">Atenção na Postagem:</span> Verifique se a arte, o texto e a data (início de vendas, virada de lote, etc.) estão corretos antes de postar.</li>
               <li>Se não puder fazer alguma postagem, avise com antecedência para evitar ser removida do grupo.</li>
              <li className="italic font-semibold">Lembre-se: não enviar os prints é o mesmo que não postar.</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg dark:border-gray-700">
            <h2 className="text-xl font-semibold text-primary mb-3">2. Permanência no Grupo</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Cada participante tem apenas <span className="font-bold">uma única chance</span> de entrar no grupo. Se sair ou for removida, não será adicionada novamente.</li>
              <li><span className="font-bold">Exceções:</span> Se saiu sem querer, trocou de número ou teve algum problema, entre em contato para explicar a situação.</li>
              <li><span className="font-bold">Ausências:</span> Se não puder postar por um curto período (luto, celular quebrado, provas, etc.), avise para que sua situação seja avaliada.</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg dark:border-gray-700">
            <h2 className="text-xl font-semibold text-primary mb-3">3. Postagens Obrigatórias</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-bold">Todas as postagens</span> definidas no grupo são obrigatórias para todas as divulgadoras, mesmo para aquelas que não poderão comparecer ao evento.</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg dark:border-gray-700">
            <h2 className="text-xl font-semibold text-primary mb-3">4. Conflito de Eventos</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>É proibido divulgar outras festas ou eventos que aconteçam <span className="font-bold">no mesmo dia</span> dos eventos gerenciados por este grupo.</li>
            </ul>
          </div>

          <div className="p-4 border rounded-lg dark:border-gray-700">
            <h2 className="text-xl font-semibold text-primary mb-3">5. Seguir no Instagram</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>É fundamental seguir o perfil no Instagram para acompanhar as postagens e atualizações.
                <a 
                    href={instagramProfileLink} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="mt-2 inline-flex items-center gap-2 font-bold text-pink-600 dark:text-pink-400 hover:underline"
                >
                    <InstagramIcon className="w-5 h-5" />
                    @rafaelmacciel
                </a>
              </li>
            </ul>
          </div>

        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Ao entrar no grupo, você concorda com todas as regras acima.</p>
            <a
                href={whatsappGroupLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-colors text-lg"
            >
                Entrar no Grupo
            </a>
        </div>

      </div>
    </div>
  );
};

export default RulesPage;