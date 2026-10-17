import React from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const GameOverModal = ({ player1Score, player2Score, handleReset }) => {
  return (
    <View style={styles.container}>
      <View style={styles.modal}>
        <Text style={styles.title}>Game Over</Text>
        <View style={styles.scores}>
          <View style={styles.score}>
            <Ionicons name="trophy-sharp" size={24} color="#4CAF50" />
            <Text style={styles.scoreText}>Player 1: {player1Score}</Text>
          </View>
          <View style={styles.score}>
            <Ionicons name="trophy-sharp" size={24} color="#FF5722" />
            <Text style={styles.scoreText}>Player 2: {player2Score}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.button} onPress={handleReset}>
          <Text style={styles.buttonText}>Restart Game</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "80%",
    padding: 20,
    backgroundColor: "white",
    borderRadius: 10,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: "bold",
  },
  scores: {
    width: "100%",
    marginBottom: 20,
  },
  score: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  scoreText: {
    fontSize: 18,
    marginLeft: 10,
  },
  button: {
    backgroundColor: "darkgreen",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default GameOverModal;
