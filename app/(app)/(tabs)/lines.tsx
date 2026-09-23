import { useLocalSearchParams } from 'expo-router';

import { LegacyTransitFlow } from '@/src/features/transit/legacy-transit-flow';

export default function LinesScreen() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();

  return <LegacyTransitFlow key={reset ?? 'initial'} />;
}
