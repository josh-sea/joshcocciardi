import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Modal,
} from "react-native";
import ResetButton from "./resetButton";
import Scoreboard from "./scoreboard";
import * as Haptics from "expo-haptics";
import GameOverModal from "./gameOverModal";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import useTheme from "../hooks/useTheme";
import {
  BOARD_CONFIGS,
  applyMove,
  calculateScores,
  getCellColor,
  getBoxDimensions,
} from "../utils/gameEngine";

const Demo = () => {
  const navigation = useNavigation();
  const boardSize = "10x10";
  const config = BOARD_CONFIGS[boardSize];
  const whichPlayer = 1;
  const player1 = "You";
  const player2 = "Computer Overlord";
  const gameName = "Practice Mode";

  const { theme } = useTheme();
  const { width, height } = Dimensions.get("window");
  const { boxWidth, boxHeight, titleSize } = getBoxDimensions(width, height, boardSize);

  const [gridData, setGridData] = useState(Array(config.cells).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState(1);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (player1Score >= config.winAt || player2Score >= config.winAt) {
      setShowModal(true);
    }
  }, [player1Score, player2Score]);

  useEffect(() => {
    if (currentPlayer !== whichPlayer) {
      const randomIndex = Math.floor(Math.random() * config.cells);
      setTimeout(() => {
        handlePressBox(randomIndex);
      }, 750);
    }
  }, [currentPlayer]);

  const handlePressBox = (index) => {
    setSelectedIndex(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const updatedGridData = applyMove(gridData, index, currentPlayer, config.size);

    setGridData(updatedGridData);
    const scores = calculateScores(updatedGridData);
    setPlayer1Score(scores.player1);
    setPlayer2Score(scores.player2);
    setCurrentPlayer(currentPlayer === 1 ? 2 : 1);
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
    setCurrentPlayer(1);
    const parsedGridData = Array(config.cells).fill(null);
    setGridData(parsedGridData);
    setSelectedIndex(null);
    const scores = calculateScores(parsedGridData);
    setPlayer1Score(scores.player1);
    setPlayer2Score(scores.player2);
  };

  const renderBox = (index) => {
    const boxColor = getCellColor(gridData[index]);
    const handlePress = () => handlePressBox(index);
    return (
      <TouchableOpacity key={index} onPress={handlePress}>
        <View
          style={[
            styles.box,
            {
              height: boxHeight,
              width: boxWidth,
              backgroundColor: boxColor,
              borderStyle: "solid",
              borderWidth: index === selectedIndex ? 7 : 1,
              borderColor: index === selectedIndex ? theme.selectedBorderColor : theme.cellBorderColor,
            },
          ]}
        />
      </TouchableOpacity>
    );
  };

  const renderGrid = () => {
    const rows = [];
    for (let i = 0; i < config.size; i++) {
      const row = [];
      for (let j = 0; j < config.size; j++) {
        const index = i * config.size + j;
        row.push(renderBox(index));
      }
      rows.push(
        <View key={i} style={styles.row}>
          {row}
        </View>
      );
    }
    return rows;
  };

  const handleLogin = () => {
    navigation.navigate("Login");
  };

  const handleSignup = () => {
    navigation.navigate("Signup");
  };

  return (
    <View style={[styles.outerContainer, theme.containerBg && { backgroundColor: theme.containerBg }]}>
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={theme.containerBg ? "white" : "black"} />
      </TouchableOpacity>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, {top: height > 667 ? 45 : 20, width: width * 0.25 }]}
          onPress={handleLogin}
        >
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { top: height > 667 ? 45 : 20, width: width * 0.25 }]}
          onPress={handleSignup}
        >
          <Text style={styles.buttonText}>Signup</Text>
        </TouchableOpacity>
      </View>
      <ResetButton handleReset={handleReset} />
      <Text style={[styles.title, { fontSize: titleSize }, theme.containerBg && { color: "white" }]}>
        {gameName}
      </Text>
      <View style={styles.scoreboardContainer}>
        <Scoreboard
          player1={player1}
          player2={player2}
          player1Score={player1Score}
          player2Score={player2Score}
          currentPlayer={currentPlayer}
          whichPlayer={whichPlayer}
        />
      </View>
      {renderGrid()}
      {showModal && (
        <Modal transparent visible={showModal}>
          <GameOverModal
            handleReset={handleReset}
            player1Score={player1Score}
            player2Score={player2Score}
          />
        </Modal>
      )}
    </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 10,
  },
  backButton: {
    position: "absolute",
    top: 15,
    left: 10,
    padding: 8,
    zIndex: 11,
  },
  buttonContainer: {
    position: "absolute",
    top: 10,
    flexDirection: 'row',
  },
  button: {
    marginVertical: 16,
    height: 40,
    marginHorizontal: 20,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
  },
  buttonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
  scoreboardContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 10,
  },
  row: {
    flexDirection: "row",
  },
  title: {
    paddingBottom: 20,
    marginBottom: 10,
    fontWeight: "bold",
    fontSize: 24,
    fontFamily: "PressStart2P-Regular",
    color: "black",
  },
  box: {
    borderWidth: 1,
    borderColor: "black",
    margin: 2,
  },
});

export default Demo;
