import { describe, expect, it } from 'vitest';
import {
  parseCoordinate,
  parseMgpGpsTimestamp,
  parseRemainingMinutes,
  toCommercialLineCode,
  toInternalLineCode,
  resolveInternalLineCode,
  parseMgpArrivals,
  parseMgpResponse,
} from './telemetryMapper';
import { extrapolateArrivalItem } from './extrapolationEngine';

describe('MGP Telemetry Mapper', () => {
  it('correctly maps commercial line codes to internal codes and back', () => {
    expect(toInternalLineCode('511')).toBe('98');
    expect(toInternalLineCode('521')).toBe('100');
    expect(toCommercialLineCode('98')).toBe('511');
    expect(toCommercialLineCode('100')).toBe('521');
    // Fallback for unknown line
    expect(toInternalLineCode('999')).toBe('999');
  });

  it('correctly parses remaining minutes from various text formats', () => {
    expect(parseRemainingMinutes('Arribando')).toBe(0);
    expect(parseRemainingMinutes('Próximo')).toBe(0);
    expect(parseRemainingMinutes('proximo')).toBe(0);
    expect(parseRemainingMinutes('5 min. aprox.')).toBe(5);
    expect(parseRemainingMinutes('12 min')).toBe(12);
    expect(parseRemainingMinutes(8)).toBe(8);
    expect(parseRemainingMinutes(null)).toBeNull();
    expect(parseRemainingMinutes('')).toBeNull();
  });

  it('safely parses coordinate floats with commas and dots', () => {
    expect(parseCoordinate('-38.0055')).toBeCloseTo(-38.0055);
    expect(parseCoordinate('-38,0055')).toBeCloseTo(-38.0055);
    expect(parseCoordinate(-38.0055)).toBeCloseTo(-38.0055);
    expect(parseCoordinate(null)).toBeNull();
    expect(parseCoordinate('invalid')).toBeNull();
  });

  it('converts the MGP Argentina GPS timestamp to an ISO instant', () => {
    expect(parseMgpGpsTimestamp('24/09/2026 10:15:30')).toBe('2026-09-24T13:15:30.000Z');
  });

  it('parses valid MGP JSON responses into BusArrivalItem list', () => {
    const samplePayload = JSON.stringify([
      {
        linea: '511',
        bandera: 'Luro',
        minutos: '4 min',
        distancia: '1200',
        coche: '42',
        adaptado: 'SI',
        latitud: '-38.001',
        longitud: '-57.550',
        latitudParada: '-38.000',
        longitudParada: '-57.555',
      },
    ]);

    const items = parseMgpResponse(samplePayload, '511');
    expect(items).toHaveLength(1);
    expect(items[0].lineCode).toBe('511');
    expect(items[0].branch).toBe('Luro');
    expect(items[0].remainingMinutes).toBe(4);
    expect(items[0].vehicleUnit).toBe('42');
    expect(items[0].accessible).toBe(true);
    expect(items[0].status).toBe('LIVE');
  });

  it('parses the PascalCase MGP payload used by the former working backend', () => {
    const payload = JSON.stringify({
      CodigoEstado: 0,
      MensajeEstado: 'ok',
      arribos: [
        {
          DescripcionLinea: '511',
          DescripcionBandera: 'Luro',
          Arribo: '14:05',
          Minutos: 5,
          Distancia: 1200,
          IdentificadorCoche: '42',
          EsAdaptado: '1',
          Latitud: '-38.001',
          Longitud: '-57.550',
          LatitudParada: '-38.000',
          LongitudParada: '-57.555',
          UltimaFechaHoraGPS: '24/09/2026 10:00:00',
          DesvioHorario: '2 min',
          IdentificadorChofer: 'driver-7',
        },
      ],
    });

    const items = parseMgpResponse(payload, '511');

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      lineCode: '511',
      branch: 'Luro',
      remainingMinutes: 5,
      estimatedArrivalTime: '14:05',
      distanceMeters: 1200,
      vehicleUnit: '42',
      accessible: true,
      timestamp: '2026-09-24T13:00:00.000Z',
      scheduleDeviation: '2 min',
      driverId: 'driver-7',
    });
  });

  it('accepts an individual MGP arrival object and lower-case aliases', () => {
    const items = parseMgpResponse(
      JSON.stringify({
        codigoLineaParada: '98',
        descripcionCartelBandera: 'Luro',
        arribo: 'Arribando',
        identificadorCoche: '18',
        esAdaptado: 'true',
      }),
      ''
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      lineCode: '98',
      branch: 'Luro',
      remainingMinutes: 0,
      vehicleUnit: '18',
      accessible: true,
    });
  });

  it('correctly uses resolveInternalLineCode and parseMgpArrivals directly', () => {
    expect(resolveInternalLineCode('511')).toBe('98');
    expect(resolveInternalLineCode('BATAN')).toBe('344');

    const rawArray = [
      {
        linea: '511',
        bandera: 'Luro',
        arribo: 'Próximo',
        coche: '10',
        adaptado: 'SI',
      },
      {
        linea: '511',
        bandera: 'Luro',
        arribo: 'Arribando',
        coche: '12',
        adaptado: false,
      },
    ];

    const arrivals = parseMgpArrivals(rawArray, '511');
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0].remainingMinutes).toBe(0);
    expect(arrivals[1].remainingMinutes).toBe(0);
  });
});

describe('Dead Reckoning Extrapolation Engine', () => {
  it('extrapolates countdown seconds and minutes over time', () => {
    const baseTime = new Date('2026-09-24T12:00:00Z');
    const arrival = {
      lineCode: '511',
      branch: 'Luro',
      remainingMinutes: 10,
      distanceMeters: 2000,
      estimatedArrivalTime: null,
      vehicleUnit: '42',
      accessible: true,
      status: 'LIVE' as const,
      timestamp: baseTime.toISOString(),
      latitude: -38.0,
      longitude: -57.5,
      stopLatitude: -38.01,
      stopLongitude: -57.51,
    };

    // 2 minutes later
    const futureTime2Min = new Date('2026-09-24T12:02:00Z');
    const extrapolated = extrapolateArrivalItem(arrival, futureTime2Min);

    expect(extrapolated.elapsedSeconds).toBe(120);
    expect(extrapolated.extrapolatedRemainingMinutes).toBe(8);
    expect(extrapolated.status).toBe('ESTIMATED_FALLBACK');
  });

  it('marks arrival as EXPIRED if elapsed time exceeds 25 minutes', () => {
    const baseTime = new Date('2026-09-24T12:00:00Z');
    const arrival = {
      lineCode: '511',
      branch: 'Luro',
      remainingMinutes: 5,
      distanceMeters: 500,
      estimatedArrivalTime: null,
      vehicleUnit: '42',
      accessible: true,
      status: 'LIVE' as const,
      timestamp: baseTime.toISOString(),
      latitude: -38.0,
      longitude: -57.5,
      stopLatitude: -38.01,
      stopLongitude: -57.51,
    };

    // 26 minutes later
    const futureTime26Min = new Date('2026-09-24T12:26:00Z');
    const extrapolated = extrapolateArrivalItem(arrival, futureTime26Min);

    expect(extrapolated.status).toBe('EXPIRED');
    expect(extrapolated.extrapolatedRemainingMinutes).toBe(0);
  });
});
