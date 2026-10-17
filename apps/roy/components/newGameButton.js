import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from '@expo/vector-icons';

const CreateGameButton = ({ onPress }) => {
  return (
    <TouchableOpacity style={styles.createGameButton} onPress={onPress}>
      <View style={styles.iconContainer}>
        <Ionicons name="add" size={32} color="white" />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  createGameButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'lightgray',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 32,
    height: 32,
    position: 'absolute',
    bottom: 16,
    right: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default CreateGameButton;
