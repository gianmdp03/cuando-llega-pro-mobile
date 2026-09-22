import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { focusManager } from '@tanstack/react-query';

export function ReactQueryAppState({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    const subscription = AppState.addEventListener('change', setReactQueryFocus);
    return () => subscription.remove();
  }, []);

  return children;
}

function setReactQueryFocus(nextAppState: AppStateStatus): void {
  focusManager.setFocused(nextAppState === 'active');
}
