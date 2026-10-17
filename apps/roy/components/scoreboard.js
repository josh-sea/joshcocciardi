import React from "react";
import { View, StyleSheet, Text, Dimensions } from "react-native";
import PlayerShape from "./playerShape";

const Scoreboard = ({ player1Score, player2Score, currentPlayer, whichPlayer, player1, player2 }) => {
const { width } = Dimensions.get("window");
const widthFont = width > 375 ? 16 : 12;
  return (
    <View style={styles.scoreboardContainer}>
        {whichPlayer === currentPlayer && <PlayerShape currentPlayer={whichPlayer}/>}
        <Text
          style={[
            styles.scoreText,
            currentPlayer === whichPlayer && styles.boldText,
            whichPlayer === 1 ? styles.player1Text : styles.player2Text,
            {fontSize: widthFont}
          ]}
        >
          {whichPlayer === 1 ? player1 || "You" : player2 || "You"}:{whichPlayer === 1 ? player1Score : player2Score}
        </Text>
        <Text
          style={[
            styles.scoreText,
            currentPlayer !== whichPlayer && styles.boldText,
            whichPlayer === 1 ? styles.player2Text : styles.player1Text,
            {fontSize: widthFont}
          ]}
        >
          {whichPlayer === 1 ? player2 || "Opponent" : player1 || "Opponent"}:{whichPlayer === 1 ? player2Score : player1Score}
        </Text>
        {whichPlayer !== currentPlayer && <PlayerShape currentPlayer={currentPlayer}/>}
    </View>
  );
};

const styles = StyleSheet.create({
  scoreboardContainer: {
    flexDirection: "row", // Change to "row" to place items side by side.
    marginBottom: 10,
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap", // Allow items to wrap to the next line if the container width is not enough.
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "200",
    marginBottom: 10,
    marginHorizontal: 5,
    paddingHorizontal: 5,
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  boldText: {
    fontWeight: "bold",
    textDecorationLine: "underline",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  player1Text: {
    color: "orange",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
  player2Text: {
    color: "purple",
    fontFamily: "PressStart2P-Regular", // Use a custom 8-bit style font if available
  },
});

export default Scoreboard;
