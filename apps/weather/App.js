import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Platform } from 'react-native';
import Weather from './components/Weather';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar 
        barStyle="dark-content" 
        backgroundColor="#f5f5f5"
        translucent={false}
      />
      <Weather />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
});
