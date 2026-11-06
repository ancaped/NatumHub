import { useState } from 'react';
import { campoDoNome, ehCampoDoSistema } from '../lib/campos';

interface Props {
  texto: string;
  rotulos: Record<string, string>;
  /** Devolve o texto novo e os nomes das caixas, para gravar nas propriedades do elemento. */
  onChange: (texto: string, rotulos: Record<string, string>) => void;
}

/** Quanto do texto é fixo, do sistema ou para preencher no painel do modelo. */
export function tipoDoTexto(texto: string): 'fixo' | 'sistema' | 'preencher' {
  const campos = [...texto.matchAll(/\{([a-z_0-9]+)\}/gi)].map((m) => m[1]);
  if (campos.some((c) => !ehCampoDoSistema(c))) return 'preencher';
  return campos.length ? 'sistema' : 'fixo';
}

const ROTULO = { fixo: 'Texto fixo: igual em toda etiqueta', sistema: 'Dado do sistema: vem do produto, lote ou datas', preencher: 'Campo para preencher: aparece como caixa no painel do modelo' } as const;

/** Marca um texto do modelo como campo para preencher (vira caixa com sugestões no painel do modelo). */
export default function CampoPreencherEditor({ texto, rotulos, onChange }: Props) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const tipo = tipoDoTexto(texto);
  const campos = [...new Set([...texto.matchAll(/\{([a-z_0-9]+)\}/gi)].map((m) => m[1].toLowerCase()))].filter((c) => !ehCampoDoSistema(c));

  const adicionar = () => {
    const campo = campoDoNome(nome);
    if (!campo) return setErro('Digite o nome da caixa, por exemplo: Fornecedor.');
    if (ehCampoDoSistema(campo)) return setErro('Esse nome já é um dado do sistema. Use outro nome.');
    if (campos.includes(campo)) return setErro('Esse campo já está neste texto.');
    onChange(texto ? `${texto} {${campo}}` : `{${campo}}`, { ...rotulos, [campo]: nome.trim() });
    setNome('');
    setErro('');
  };

  return (
    <div className="space-y-1.5">
      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${tipo === 'preencher' ? 'bg-blue-100 text-blue-800' : tipo === 'sistema' ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-100 text-zinc-600'}`}>
        {ROTULO[tipo]}
      </span>
      {campos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {campos.map((c) => (
            <span key={c} className="text-[11px] font-mono bg-blue-50 text-blue-800 border border-blue-200 rounded px-1.5 py-0.5">
              {`{${c}}`} → {rotulos[c] || c}
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={nome}
          onChange={(e) => { setNome(e.target.value); setErro(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          placeholder="Novo campo para preencher (ex.: Fornecedor)"
          className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-zinc-300 rounded-lg bg-white"
        />
        <button type="button" onClick={adicionar} className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white cursor-pointer">
          + Campo
        </button>
      </div>
      {erro && <p className="text-[11px] text-red-600">{erro}</p>}
    </div>
  );
}
