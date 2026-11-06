import { useEffect, useRef, useState } from 'react';
import { camposApi, type SugestaoCampo } from '../lib/campos';
import '../etiquetas.css';

interface Props {
  campo: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
}

/** Caixa de texto que completa com o que já foi impresso nesse campo (e com o cadastro do sistema, quando existe). */
export default function CampoComSugestao({ campo, rotulo, valor, onChange }: Props) {
  const [sugestoes, setSugestoes] = useState<SugestaoCampo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const pedido = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    const id = ++pedido.current;
    const t = setTimeout(() => {
      camposApi.sugerir(campo, valor).then((lista) => {
        if (id !== pedido.current) return;
        setSugestoes(lista.filter((s) => s.valor !== valor));
        setAtivo(-1);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [aberto, campo, valor]);

  const escolher = (s: SugestaoCampo) => {
    onChange(s.valor);
    setAberto(false);
  };

  return (
    <div className="campo-sug">
      <label className="campo-sug-rotulo" htmlFor={`campo-${campo}`}>
        {rotulo}
      </label>
      <input
        id={`campo-${campo}`}
        className="campo-sug-input"
        value={valor}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAtivo((i) => Math.min(i + 1, sugestoes.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && aberto && ativo >= 0 && sugestoes[ativo]) {
            e.preventDefault();
            escolher(sugestoes[ativo]);
          } else if (e.key === 'Escape') {
            setAberto(false);
          }
        }}
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="campo-sug-lista" role="listbox">
          {sugestoes.map((s, i) => (
            <li key={`${s.origem}-${s.valor}`} role="option" aria-selected={i === ativo}>
              <button type="button" className={i === ativo ? 'ativo' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(s)}>
                <span>{s.valor}</span>
                {s.origem === 'sistema' && <small>cadastro</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
