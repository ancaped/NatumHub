import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNomeArquivo } from './pop-filename.mjs';

test('CQL com (NOVO) e espaços duplos', () => {
  assert.deepEqual(parseNomeArquivo('POP 035 CQL Limpeza de equipamentos e aparelhos de medição (NOVO).docx'),
    { setor: 'cql', numero: '035', codigo: 'POP-CQL-035', titulo: 'Limpeza de equipamentos e aparelhos de medição' });
  assert.equal(parseNomeArquivo('POP 003 ALM  Armazenamento e Retirada.docx').titulo, 'Armazenamento e Retirada');
});
test('sigla grudada e PDR', () => {
  assert.equal(parseNomeArquivo('POP 051ADM Saúde dos funcionarios.docx').codigo, 'POP-ADM-051');
  assert.equal(parseNomeArquivo('POP 061CQL Análise Microbiológica.docx').codigo, 'POP-CQL-061');
  assert.equal(parseNomeArquivo('POP 039 PDR Impressão de dados.docx').codigo, 'POP-PRD-039');
});
test('Elaboração e Revalidação vão para ADM', () => {
  assert.equal(parseNomeArquivo('ELABORAÇÃO DO POP 001.docx').codigo, 'POP-ADM-001');
  assert.equal(parseNomeArquivo('REVALIDAÇÃO DO POP 002.docx').codigo, 'POP-ADM-002');
  assert.equal(parseNomeArquivo('POP 002 CQL  Qualidade Organolépticas.docx').codigo, 'POP-CQL-002');
});
test('correção de título e "- novo"', () => {
  assert.equal(parseNomeArquivo('POP 041 ADM Protudos Terceirizados.docx').titulo, 'Produtos Terceirizados');
  assert.equal(parseNomeArquivo('POP 064 CQL Atestt autoclave.docx').titulo, 'Atest autoclave');
  assert.equal(parseNomeArquivo('POP 011 ATD Atendimento ao Público - novo.docx').titulo, 'Atendimento ao Público');
});
test('nome inválido', () => assert.equal(parseNomeArquivo('Planilha.docx'), null));
