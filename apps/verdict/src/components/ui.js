import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../constants/theme';

export function Screen({ children, scroll = false, edges = ['top'], style, contentStyle, refreshControl }) {
  return (
    <SafeAreaView edges={edges} style={[styles.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.pad, contentStyle]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, loading, style, small }) {
  const k = BUTTON[kind];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, { backgroundColor: k.bg, borderColor: k.border },
        (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={k.fg} /> : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={k.fg} style={{ marginRight: 6 }} /> : null}
          <Text style={[styles.btnText, small && { fontSize: 14 }, { color: k.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: colors.accent, fg: colors.accentText, border: colors.accent },
  secondary: { bg: colors.surface2, fg: colors.text, border: colors.border },
  ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
  danger: { bg: 'transparent', fg: colors.danger, border: colors.danger },
};

export function Field({ label, error, hint, style, ...props }) {
  return (
    <View style={[{ marginBottom: space(4) }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, error && { borderColor: colors.danger }, props.multiline && { minHeight: 88, textAlignVertical: 'top' }]}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={[type.small, { marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

export const H = ({ children, style }) => <Text style={[type.title, style]}>{children}</Text>;
export const H2 = ({ children, style }) => <Text style={[type.h2, style]}>{children}</Text>;
export const P = ({ children, style, ...rest }) => <Text style={[type.body, style]} {...rest}>{children}</Text>;
export const Small = ({ children, style, ...rest }) => <Text style={[type.small, style]} {...rest}>{children}</Text>;

export function Section({ title, action, children, style }) {
  return (
    <View style={[{ marginTop: space(6) }, style]}>
      <View style={[styles.row, { justifyContent: 'space-between', marginBottom: space(3) }]}>
        <Text style={type.h3}>{title}</Text>
        {action || null}
      </View>
      {children}
    </View>
  );
}

export function Empty({ icon = 'film-outline', title, body, children }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={colors.faint} />
      <Text style={[type.h3, { marginTop: space(3), textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[type.small, { marginTop: space(2), textAlign: 'center' }]}>{body}</Text> : null}
      {children ? <View style={{ marginTop: space(4), alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

export const Loading = () => (
  <View style={[styles.flex, styles.center]}><ActivityIndicator color={colors.accent} /></View>
);

export function ErrorText({ error }) {
  if (!error) return null;
  return <Text style={[styles.error, { marginBottom: space(3) }]}>{error.message || String(error)}</Text>;
}

export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, on && styles.segOn]}>
            <Text style={[styles.segText, on && { color: colors.text }]} numberOfLines={1}>{o.label}</Text>
            {o.badge ? <View style={styles.badge}><Text style={styles.badgeText}>{o.badge}</Text></View> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      {icon ? <Ionicons name={icon} size={14} color={on ? colors.accentText : colors.muted} style={{ marginRight: 4 }} /> : null}
      <Text style={[styles.chipText, on && { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ name, onPress, color = colors.text, size = 22, label }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export const Divider = () => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space(3) }} />;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { padding: space(4), paddingBottom: space(16) },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { borderRadius: radius.md, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { ...type.small, color: colors.muted, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  empty: { alignItems: 'center', padding: space(8) },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surface2 },
  segText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  badge: { marginLeft: 6, backgroundColor: colors.accent, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: colors.accentText, fontSize: 11, fontWeight: '800' },
  chip: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, marginBottom: 8,
  },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
