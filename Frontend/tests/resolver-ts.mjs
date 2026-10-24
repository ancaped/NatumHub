// Hook de resolução para `node --test`: os fontes importam sem extensão
// (`from './unitConversion'`); aqui o especificador relativo sem extensão
// passa a apontar para o arquivo `.ts` quando ele existe. Só `.ts` (sem JSX).
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(fileURLToPath(url))) {
        return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
