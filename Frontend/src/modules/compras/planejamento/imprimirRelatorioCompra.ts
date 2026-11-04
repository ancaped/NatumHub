import { loadNatumLogoDataUrl } from '../../geral/lib/logoUtils';
import { montarRelatorioCompra } from './relatorioCompra';
import type { DadosRelatorio } from './relatorioCompra';

/**
 * Imprime o relatório num iframe oculto. O iframe nasce no clique (síncrono); a logo é
 * carregada depois e o documento só é impresso com a imagem já decodificada. Falha na logo
 * imprime sem ela.
 */
export async function imprimirRelatorioCompra(dados: Omit<DadosRelatorio, 'logo'>): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:none;opacity:0;pointer-events:none';
  document.body.appendChild(iframe);
  const janela = iframe.contentWindow;
  const doc = janela?.document;
  if (!janela || !doc) {
    document.body.removeChild(iframe);
    alert('Não foi possível iniciar a impressão.');
    return;
  }

  let logo = '';
  try {
    logo = await Promise.race([
      loadNatumLogoDataUrl(),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 4000)),
    ]);
  } catch {
    logo = '';
  }

  doc.open();
  doc.write(montarRelatorioCompra({ ...dados, logo }));
  doc.close();

  const imagens = Array.from(doc.images);
  await Promise.race([
    Promise.all(imagens.map((img) => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()))),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 150));

  janela.focus();
  janela.print();
  setTimeout(() => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }, 1000);
}
