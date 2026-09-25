import { describe, expect, it } from 'vitest';

import {
  isMgpClientRefreshRequired,
  parseMgpIntersections,
  parseMgpLines,
  parseMgpStopsWithFlag,
  parseMgpStreets,
} from './transitCatalogMapper';

describe('MGP transit catalog normalization', () => {
  it('normalizes municipal lines to the UI DTO', () => {
    expect(
      parseMgpLines(
        '{"lineas":[{"CodigoLineaParada":"98","Descripcion":"511","CodigoEntidad":"10","CodigoEmpresa":13}]}'
      )
    ).toEqual([
      { id: '98', codigo: '511', descripcion: '511', codigoEntidad: '10', codigoEmpresa: 13 },
    ]);
  });

  it('normalizes and strips municipal street and intersection suffixes', () => {
    expect(
      parseMgpStreets(
        '{"calles":[{"Codigo":"2","Descripcion":"B - GENERAL PUEYRREDON"},{"Codigo":"1","Descripcion":"A - MAR DEL PLATA"}]}'
      )
    ).toEqual([
      { codigo: '1', descripcion: 'A' },
      { codigo: '2', descripcion: 'B' },
    ]);
    expect(
      parseMgpIntersections('{"calles":[{"Codigo":"3","Descripcion":"ALEM - MAR DEL PLATA"}]}')
    ).toEqual([{ codigo: '3', descripcion: 'ALEM' }]);
  });

  it('normalizes stops and nullable coordinates', () => {
    expect(
      parseMgpStopsWithFlag(
        '{"paradas":[{"Codigo":"17453","Identificador":"P4031","Descripcion":"P4031","AbreviaturaBandera":"A ACANTILADOS","AbreviaturaAmpliadaBandera":"A ACANTILADOS","LatitudParada":"-38,1","LongitudParada":null}]}'
      )
    ).toEqual([
      {
        codigo: '17453',
        identificador: 'P4031',
        descripcion: 'P4031',
        abreviaturaBandera: 'A ACANTILADOS',
        abreviaturaAmpliadaBandera: 'A ACANTILADOS',
        latitudParada: -38.1,
        longitudParada: null,
      },
    ]);
  });

  it('activates client refresh only for the explicit backend problem type', () => {
    expect(
      isMgpClientRefreshRequired({
        problem: { type: 'urn:cuando-llega:mgp-client-refresh-required' },
      })
    ).toBe(true);
    expect(isMgpClientRefreshRequired({ problem: { type: 'about:blank' } })).toBe(false);
  });
});
