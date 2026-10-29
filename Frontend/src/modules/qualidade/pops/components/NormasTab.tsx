const BLOCOS: { titulo: string; itens: string[] }[] = [
  {
    titulo: 'Norma',
    itens: [
      'A fábrica segue a RDC ANVISA 48/2013 (BPF de higiene pessoal, cosméticos e perfumes).',
      'A Vigilância Sanitária de Minas Gerais aplica essa RDC. Não há regra mineira própria de numeração.',
      'O texto oficial da RDC precisa ser conferido antes de fechar a revisão dos POPs.',
    ],
  },
  {
    titulo: 'Códigos',
    itens: [
      'POP: POP-SETOR-NNN, revisão com dois dígitos. Exemplo: POP-CQL-015 Rev. 04.',
      'Formulário: FOR-SETOR-NNN-SEQ, no número do POP ao qual pertence. Exemplo: FOR-CQL-015-01.',
      'Setores: ADM, ALM, ATD, EXP, PRD e CQL. O sequencial do formulário não muda. A revisão muda quando a alteração é aprovada.',
      'Revisão a cada 2 anos, ou antes se o processo mudar.',
    ],
  },
  {
    titulo: 'Status',
    itens: [
      'Rascunho → em aprovação → vigente → obsoleto.',
      'Enviar, aprovar, revalidar ou tornar obsoleto exige motivo. Elaborado, revisado e aprovado se assinam à caneta na folha impressa.',
      'Nada é apagado. O obsoleto sai da lista Em uso e continua em Todos os status.',
      'Só a revisão vigente pode ser usada no chão de fábrica. Folha antiga se marca OBSOLETO e se recolhe.',
    ],
  },
  {
    titulo: 'Preenchimento em papel',
    itens: [
      'Caneta azul ou preta, no momento da atividade. Sem lápis, caneta apagável ou corretivo.',
      'Data DD/MM/AAAA. Quem executou e quem verificou assinam.',
      'Erro: um traço, o valor certo ao lado, rubrica, data e motivo. O erro continua legível.',
      'Campo que não se aplica: N/A. Fora do limite: abrir não conformidade (POP-CQL-081).',
    ],
  },
  {
    titulo: 'Registro eletrônico',
    itens: [
      'O Nexus ainda não substitui o papel. Temperatura e limpeza em tela ficam para a fase seguinte.',
      'Quando entrar, o registro eletrônico precisa de login individual, motivo em toda alteração e proibição de apagar.',
    ],
  },
];

export default function NormasTab() {
  return (
    <div className="space-y-3 max-w-3xl">
      {BLOCOS.map((b) => (
        <section key={b.titulo} className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
          <h2 className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 bg-zinc-50/70 border-b border-zinc-200/80">
            {b.titulo}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {b.itens.map((item) => (
              <li key={item} className="px-4 py-3 text-sm text-zinc-800">{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
