/** RFC 7807 error payload returned by the backend. */
export type ProblemDetail = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  timestamp?: string;
  errors?: ProblemFieldError[];
};

export type ProblemFieldError = {
  field: string;
  rejectedValue: unknown;
  message: string;
};

export type TelemetryStatus = 'LIVE' | 'ESTIMATED_FALLBACK' | 'EXPIRED' | 'UNAVAILABLE' | 'DELEGATED_TO_CLIENT';

export type BusArrival = {
  lineCode: string | null;
  branch: string | null;
  remainingMinutes: number | null;
  distanceMeters: number | null;
  estimatedArrivalTime: string | null;
  vehicleUnit: string | null;
  accessible: boolean | null;
  status: TelemetryStatus;
  timestamp: string | null;
  latitude: number | null;
  longitude: number | null;
  scheduleDeviation: string | null;
  driverId: string | null;
  stopLatitude: number | null;
  stopLongitude: number | null;
  bearing: number | null;
  speedKmH: number | null;
};

export type ArrivalResponseDTO = {
  lineCode: string;
  stopId: string;
  branch: string | null;
  status: TelemetryStatus;
  timestamp: string | null;
  deltaMinutes: number | null;
  arrivals: BusArrival[];
  stopLatitude: number | null;
  stopLongitude: number | null;
};

export type DirectionDto = {
  direction: string;
  expandedDirection: string | null;
};

/** `code` is internal; `name` is the commercial code used in UI and requests. */
export type MapLine = {
  code: string;
  name: string;
};

export type MapStop = {
  identifier: string;
  code: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Official MGP road geometry. Coordinates are [longitude, latitude]. */
export type MapRoute = {
  id: string;
  branch: string;
  description: string | null;
  coordinates: [number, number][];
};

export type MapStopDirection = {
  codeTransitLine: string;
  nameTransitLine: string;
  direction: string;
  expandedDirection: string | null;
};

export type MapStopDetail = {
  identifier: string;
  latitude: number | null;
  longitude: number | null;
  directions: MapStopDirection[];
};

export type NearbyMapStop = {
  identifier: string;
  description: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  directions: MapStopDirection[];
};

export type StopDirectionArrivals = {
  direction: string;
  expandedDirection: string | null;
  arrivals: BusArrival[];
};

export type StopLineArrivals = {
  lineCode: string;
  status: TelemetryStatus | 'UNAVAILABLE';
  timestamp: string | null;
  deltaMinutes: number | null;
  directions: StopDirectionArrivals[];
  error: string | null;
};

export type StopArrivalsDto = {
  identifier: string;
  latitude: number | null;
  longitude: number | null;
  lines: StopLineArrivals[];
};

export type TransitLineDTO = {
  id: string;
  codigo: string;
  descripcion: string;
  codigoEntidad: string | null;
  codigoEmpresa: number | null;
};

export type TransitStreetDTO = {
  codigo: string;
  descripcion: string;
};

export type TransitIntersectionDTO = {
  codigo: string;
  descripcion: string;
};

export type TransitStopWithFlagDTO = {
  codigo: string;
  identificador: string;
  descripcion: string;
  abreviaturaBandera: string;
  abreviaturaAmpliadaBandera: string;
  latitudParada: number | null;
  longitudParada: number | null;
};

export type TransitStopDTO = {
  id: string;
  nombre: string;
  calle: string;
  latitude: number | null;
  longitude: number | null;
};

export type ConsolidatedStopDTO = {
  stopId: string;
  calle: string;
  interseccion: string;
  banderas: string[];
};

export type TransitRoutePointDTO = {
  latitude: number | null;
  longitude: number | null;
  descripcion: string | null;
  isPuntoPaso: boolean | null;
};

/** Coordinates are always ordered as [latitude, longitude]. */
export type TransitBranchRouteDTO = {
  bandera: string;
  descripcion: string;
  points: TransitRoutePointDTO[];
  coordinates: [number, number][];
};

export type TransitRouteResponseDTO = {
  lineCode: string;
  branches: TransitBranchRouteDTO[];
  allPoints: TransitRoutePointDTO[];
  coordinates: [number, number][];
};

export type AuthRequest = {
  email: string;
  password: string;
};

export type AdminCreateUserRequest = {
  email: string;
  password: string;
  fullName: string;
  role?: string;
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
  presetsCount: number;
};

export type AuthResponse = {
  token: string;
  tokenType: string;
  expiresIn: number;
  user: AuthenticatedUser;
};

export type PresetConfig = {
  alias: string;
  icon: string;
  color: string;
  location?: string | null;
};

export type PresetRequestDTO = {
  codigoLinea: string;
  identificadorParada: string;
  bandera: string | null;
  config: PresetConfig;
};

export type PresetListDTO = {
  id: number;
  codigoLinea: string;
  identificadorParada: string;
  bandera: string | null;
  alias: string | null;
  icon: string | null;
  color: string | null;
};

export type PresetDetailDTO = {
  id: number;
  userId: number | null;
  codigoLinea: string;
  identificadorParada: string;
  bandera: string | null;
  config: PresetConfig;
  createdAt: string;
};

export type DashboardPresetDTO = {
  presetId: number;
  codigoLinea: string;
  identificadorParada: string;
  bandera: string | null;
  config: PresetConfig;
  telemetry: ArrivalResponseDTO;
  error: string | null;
};

export type DashboardDTO = {
  userEmail: string;
  generatedAt: string;
  totalPresets: number;
  presets: DashboardPresetDTO[];
};
