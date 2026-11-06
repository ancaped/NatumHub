import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { labelsApi, type CatalogProduct } from '../lib/labelsApi';
import type { DadosDoSistema } from '../lib/hidratar';
import '../etiquetas.css';

export interface QuantidadeEtiquetas {
  sequencia: boolean;
  copias: number;
  inicio: number;
  total: number;
}

interface Props {
  dados: DadosDoSistema;
  onDados: (d: DadosDoSistema) => void;
  qtd: QuantidadeEtiquetas;
  onQtd: (q: QuantidadeEtiquetas) => void;
}

const inteiro = (v: string, min = 1) => Math.max(min, parseInt(v, 10) || min);

/** Produto do cadastro, dados do lote e quantidade de etiquetas, dentro do Drawer do modelo. */
export default function DadosSistemaForm({ dados, onDados, qtd, onQtd }: Props) {
  const [produtos, setProdutos] = useState<CatalogProduct[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    labelsApi
      .listCatalogProducts()
      .then((l) => setProdutos(Array.isArray(l) ? l : []))
      .finally(() => setCarregando(false));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = q
      ? produtos.filter((p) => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q) || (p.codigo_barras ?? '').includes(q))
      : produtos;
    return lista.slice(0, 30);
  }, [produtos, busca]);

  const escolher = (p: CatalogProduct) => {
    onDados({ ...dados, produto: p, unidadesPorCaixa: p.quantidade_caixa || dados.unidadesPorCaixa });
    setTrocando(false);
    setBusca('');
  };

  const mostrarLista = !dados.produto || trocando;

  return (
    <div className="dados-sis">
      <span className="dados-sis-titulo">Produto</span>
      {dados.produto && !trocando ? (
        <div className="dados-sis-produto">
          <div style={{ minWidth: 0 }}>
            <span className="product-code" style={{ fontSize: '0.7rem' }}>{dados.produto.codigo}</span>
            <div className="dados-sis-nome">{dados.produto.descricao}</div>
            <div className="dados-sis-ean">
              EAN {dados.produto.codigo_barras || '—'} · DUN {dados.produto.codigo_barras_caixa || '—'}
            </div>
          </div>
          <button type="button" className="dados-sis-trocar" onClick={() => setTrocando(true)}>
            Trocar
          </button>
        </div>
      ) : null}
      {dados.produto && !trocando && !dados.produto.codigo_barras && (
        <p className="dados-sis-aviso">Produto sem EAN no cadastro: o código de barras sairá com um número de exemplo.</p>
      )}

      {mostrarLista && (
        <>
          <div className="dados-sis-busca">
            <Search size={15} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto por código ou nome..." autoFocus={trocando} />
          </div>
          <div className="dados-sis-lista">
            {carregando ? (
              <div className="dados-sis-vazio">Carregando catálogo...</div>
            ) : filtrados.length === 0 ? (
              <div className="dados-sis-vazio">Nenhum produto encontrado.</div>
            ) : (
              filtrados.map((p) => (
                <button key={p.codigo} type="button" onClick={() => escolher(p)}>
                  <span className="product-code" style={{ fontSize: '0.68rem' }}>{p.codigo}</span>
                  <span className="dados-sis-nome">{p.descricao}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}

      <span className="dados-sis-titulo">Lote e validade</span>
      <div className="dados-sis-grade">
        <label>
          Lote
          <input className="campo-sug-input" value={dados.lote} onChange={(e) => onDados({ ...dados, lote: e.target.value.toUpperCase() })} />
        </label>
        <label>
          Fabricação
          <input className="campo-sug-input" value={dados.fabricacao} onChange={(e) => onDados({ ...dados, fabricacao: e.target.value })} />
        </label>
        <label>
          Validade
          <input className="campo-sug-input" value={dados.validade} onChange={(e) => onDados({ ...dados, validade: e.target.value })} />
        </label>
        <label>
          Unidades por caixa
          <input className="campo-sug-input" type="number" min={1} value={dados.unidadesPorCaixa} onChange={(e) => onDados({ ...dados, unidadesPorCaixa: inteiro(e.target.value) })} />
        </label>
      </div>

      <span className="dados-sis-titulo">Quantidade de etiquetas</span>
      <div className="dados-sis-abas">
        <button type="button" className={qtd.sequencia ? 'ativo' : ''} onClick={() => onQtd({ ...qtd, sequencia: true })}>
          Caixas (sequência)
        </button>
        <button type="button" className={!qtd.sequencia ? 'ativo' : ''} onClick={() => onQtd({ ...qtd, sequencia: false })}>
          Cópias iguais
        </button>
      </div>
      {qtd.sequencia ? (
        <div className="dados-sis-grade">
          <label>
            Caixa inicial
            <input className="campo-sug-input" type="number" min={1} value={qtd.inicio} onChange={(e) => { const inicio = inteiro(e.target.value); onQtd({ ...qtd, inicio, total: Math.max(inicio, qtd.total) }); }} />
          </label>
          <label>
            Total de caixas do lote
            <input className="campo-sug-input" type="number" min={qtd.inicio} value={qtd.total} onChange={(e) => onQtd({ ...qtd, total: inteiro(e.target.value, qtd.inicio) })} />
          </label>
        </div>
      ) : (
        <div className="dados-sis-grade">
          <label>
            Etiquetas idênticas
            <input className="campo-sug-input" type="number" min={1} max={1000} value={qtd.copias} onChange={(e) => onQtd({ ...qtd, copias: inteiro(e.target.value) })} />
          </label>
        </div>
      )}
    </div>
  );
}
