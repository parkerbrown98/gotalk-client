import { useRef } from 'react';
import { Platform } from 'react-native';

/** iOS cannot present a sibling modal until the current native controller has dismissed. */
export function useModalDismissal(onClose: () => void) {
  const pending = useRef<(() => void) | null>(null);

  const dismissWithAction = (action: () => void) => {
    if (Platform.OS === 'ios') {
      if (pending.current) return;
      pending.current = action;
      onClose();
    } else {
      onClose();
      action();
    }
  };

  const onDismiss = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  return { dismissWithAction, onDismiss };
}
