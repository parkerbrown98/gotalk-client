import { Text, TextField, type TextFieldProps } from '@gotalk/ui';
import { useState } from 'react';
import { Pressable } from 'react-native';

/** A password input with a Show/Hide toggle in its trailing slot. */
export function PasswordField(props: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={8} onPress={() => setVisible((v) => !v)}>
          <Text variant="captionMd" tone="muted">
            {visible ? 'Hide' : 'Show'}
          </Text>
        </Pressable>
      }
    />
  );
}
