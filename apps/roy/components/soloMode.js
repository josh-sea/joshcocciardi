import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Modal
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

const SoloMode = ({ route }) => {
  const navigation = useNavigation();
  const boardSize = route?.params?.boardSize || "10x10";
  const config = BOARD_CONFIGS[boardSize];
  const whichPlayer = 1;
  const player1 = "You";
  const player2 = "Computer Overlord";
  const gameName = "Solo mode!";

  const { theme } = useTheme();
  const { width, height } = Dimensions.get("window");
  const { boxWidth, boxHeight, boxMargin, titleSize } = getBoxDimensions(width, height, boardSize);

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

  const simulateTurns = () => {
    setCurrentPlayer(2);
    const soloGridData = Array(config.cells).fill(null);
    const fillCount = Math.floor(config.cells * 1.5);
    for (let i = 0; i < fillCount; i++) {
      const randomIndex = Math.floor(Math.random() * config.cells);
      const randomP2Color = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
      soloGridData[randomIndex] = randomP2Color;
    }
    setGridData(soloGridData);
    const scores = calculateScores(soloGridData);
    setPlayer1Score(scores.player1);
    setPlayer2Score(scores.player2);
    setCurrentPlayer(1);
  };

  useEffect(() => {
    simulateTurns();
  }, []);

  const handlePressBox = async (index) => {
    setSelectedIndex(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const updatedGridData = applyMove(gridData, index, whichPlayer, config.size);

    setGridData(updatedGridData);
    const scores = calculateScores(updatedGridData);
    setPlayer1Score(scores.player1);
    setPlayer2Score(scores.player2);
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
    setSelectedIndex(null);
    simulateTurns();
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
              marginVertical: boxMargin,
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

  return (
    <View style={[styles.outerContainer, theme.containerBg && { backgroundColor: theme.containerBg }]}>
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={theme.containerBg ? "white" : "black"} />
      </TouchableOpacity>
      <ResetButton handleReset={handleReset} />
      <Text style={[styles.title, { fontSize: titleSize }, theme.containerBg && { color: "white" }]}>{gameName}</Text>
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
            player1Score={player1Score}
            player2Score={player2Score}
            handleReset={handleReset}
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
  scoreboardContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 10,
  },
  row: {
    flexDirection: "row",
  },
  title: {
    paddingBottom: 30,
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

export default SoloMode;
