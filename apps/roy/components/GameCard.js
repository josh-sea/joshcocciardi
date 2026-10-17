import React, { useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import alert from "../utils/alert";
import { useNavigation } from "@react-navigation/native";
import { set } from "firebase/database";
import { royRef } from "../admin/firebaseConfig";

const { width } = Dimensions.get("window");
const cardWidth = width * 0.85; // Responsive card width

const GameCard = ({ game, userId }) => {
  const gameRef = useRef(null);
  const navigation = useNavigation();

  const deleteGame = () => {
    gameRef.current = royRef(`/games/${game.gameId}`);
    alert(
      "Confirm Deletion",
      "Are you sure you want to delete this game?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await set(gameRef.current, null);
              console.log("Game deleted successfully!");
            } catch (error) {
              console.error("Error deleting game:", error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleGamePress = () => {
    const player1 = game.players ? game.players.player1.username : "";
    const player2 = game.players ? game.players.player2.username : "";

    navigation.navigate("Grid", {
      gameId: game.gameId,
      gameName: game.name,
      active: true,
      player1,
      player2,
      boardSize: game.boardSize || "10x10",
    });
  };

  const boardLabel = game.boardSize === "5x5" ? "5x5" : game.boardSize === "15x15" ? "15x15" : null;

  return (
    <TouchableOpacity
      onPress={handleGamePress}
      onLongPress={deleteGame}
      style={styles.touchable}
    >
      <View style={styles.gameCardContainer}>
        <Text style={styles.gameCard}>{game.name}</Text>
        {boardLabel && <Text style={styles.boardBadge}>{boardLabel}</Text>}
        {game.myTurn && <View style={styles.appBadge} />}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    width: cardWidth,
    marginBottom: 16,
  },
  gameCardContainer: {
    borderWidth: 1,
    borderColor: "gray",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "white",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  gameCard: {
    fontSize: 12,
    textAlign: "center",
    fontFamily: "PressStart2P-Regular",
  },
  appBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    backgroundColor: "#FF10F0",
    borderRadius: 8,
    width: 16,
    height: 16,
  },
  boardBadge: {
    position: "absolute",
    bottom: 6,
    right: 8,
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "#999",
  },
});

export default GameCard;
