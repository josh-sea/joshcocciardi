import React, { useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  Animated,
  AppState,
  Modal,
} from "react-native";
import ResetButton from "./resetButton";
import Scoreboard from "./scoreboard";
import * as Haptics from "expo-haptics";
import { royRef } from "../admin/firebaseConfig";
import { set, get, onValue, update } from "firebase/database";
import ActionMenu from "./ActionMenu";
import EmoteStore from "./EmoteStore";
import GameOverModal from "./gameOverModal";
import ShapePreview from "./ShapePreview";
import useFeatureFlags from "../hooks/useFeatureFlags";
import useTheme from "../hooks/useTheme";
import { useNavigation } from "@react-navigation/native";
import { useUserId } from "../admin/session";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAnimation } from "../utils/animationData";
import {
  BOARD_CONFIGS,
  SHAPE_NAMES,
  applyMove,
  calculateScores,
  getCellColor,
  getBoxDimensions,
  getCurrentShape,
  getNextShape,
  generateShapeOrder,
  getShapeIndices,
} from "../utils/gameEngine";

// Outside the component, declare a variable to track the previous active status
let prevActiveData = null;

const Grid = ({ route }) => {
  const navigation = useNavigation();
  const dbActiveRef = useRef(null);

  const userId = useUserId();
  const { gameId, gameName, player1, player2, boardSize: routeBoardSize } = route.params;
  const boardSize = routeBoardSize || "10x10";
  const config = BOARD_CONFIGS[boardSize];
  const { emotes: ownedEmotePacks, themes: ownedThemes, animations: ownedAnimations } = useFeatureFlags(userId);
  const { themeId, theme, selectTheme } = useTheme();
  const whichPlayerRef = useRef(null);

  const { width, height } = Dimensions.get("window");
  const { boxWidth, boxHeight, boxMargin, titleSize } = getBoxDimensions(width, height, boardSize);

  // Core game state
  const [gridData, setGridData] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [message, setMessage] = useState(null);
  const [animation] = useState(new Animated.Value(0));
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Strategist state
  const [isStrategist, setIsStrategist] = useState(false);
  const [shapeOrder, setShapeOrder] = useState(null); // { player1: [0,2,1], player2: [1,0,2] }
  const [moveCount, setMoveCount] = useState({ player1: 0, player2: 0 });
  const [showShapePicker, setShowShapePicker] = useState(false);
  const [showEmoteStore, setShowEmoteStore] = useState(false);
  const [myAnimationId, setMyAnimationId] = useState("pulse");
  const cellAnimValues = useRef({});
  const cellAnimTypes = useRef({}); // animation type per cell for correct interpolation

  useEffect(() => {
    if (player1Score >= config.winAt || player2Score >= config.winAt) {
      setShowModal(true);
    }
  }, [player1Score, player2Score]);

  const updateMessageData = (data) => {
    set(dbMessageRef.current, data).catch((error) => {
      console.error("Error updating game index data:", error);
    });
  };

  const handleTrashTalk = (name) => {
    whichPlayerRef.current &&
      updateMessageData({ value: name, sender: whichPlayerRef.current });
  };

  const dbGridRef = useRef(null);
  const dbGameRef = useRef(null);
  const dbTurnRef = useRef(null);
  const dbIndexRef = useRef(null);
  const dbMessageRef = useRef(null);

  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      const playerKey = whichPlayerRef.current === 1 ? "player1" : "player2";
      const isActive = nextAppState === "active";
      update(dbActiveRef.current, { [playerKey]: isActive }).catch((error) => {
        console.error(`Error updating ${playerKey} active status:`, error);
      });
    };

    const appStateListener = AppState.addEventListener("change", handleAppStateChange);
    return () => appStateListener.remove();
  }, []);

  const updatePlayerScores = (data) => {
    const scores = calculateScores(data);
    setPlayer1Score(scores.player1);
    setPlayer2Score(scores.player2);
  };

  const animatedStyle = {
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [-200, 50],
        }),
      },
    ],
    opacity: animation,
  };

  // Load game data and set up listeners
  useEffect(() => {
    if (gameId) {
      dbGameRef.current = royRef(`/games/${gameId}`);
      dbTurnRef.current = royRef(`/games/${gameId}/turn`);
      dbIndexRef.current = royRef(`/games/${gameId}/selected`);
      dbGridRef.current = royRef(`/games/${gameId}/grid`);
      dbMessageRef.current = royRef(`/games/${gameId}/message`);
      dbActiveRef.current = royRef(`/games/${gameId}/active`);

      get(dbGameRef.current).then((snapshot) => {
        const data = snapshot.val();
        if (data) {
          const player = data.player1 === userId ? 1 : 2;
          whichPlayerRef.current = player;
          setCurrentPlayer(data.turn);
          setSelectedIndex(data.selected);

          if (data.grid) {
            const parsedGridData = Array(config.cells).fill(null);
            Object.entries(data.grid).forEach(([key, value]) => {
              const index = parseInt(key, 10);
              if (!isNaN(index) && index >= 0 && index < config.cells) {
                parsedGridData[index] = value;
              }
            });
            setGridData(parsedGridData);
            updatePlayerScores(parsedGridData);
          } else {
            setGridData(Array(config.cells).fill(null));
            updatePlayerScores(null);
          }

          // Strategist setup
          if (data.gameType === "strategist") {
            setIsStrategist(true);
            if (data.moveCount) setMoveCount(data.moveCount);
            if (data.shapeOrder) {
              setShapeOrder(data.shapeOrder);
              // Player 2 needs to pick their starting shape on first open
              if (player === 2 && !data.shapeOrder.player2) {
                setShowShapePicker(true);
              }
            }
          }

          const playerKey = player === 1 ? "player1" : "player2";
          update(dbActiveRef.current, { [playerKey]: true }).catch((error) => {
            console.error(`Error updating ${playerKey} active status:`, error);
          });

          // Write current animation preference to Firebase now that player is identified
          AsyncStorage.getItem("roy_move_animation").then((saved) => {
            const animId = saved || "pulse";
            const animRef = royRef(`/games/${gameId}/animations/${playerKey}`);
            set(animRef, animId).catch(() => {});
          });
        }
      });

      const unsubscribeStatus = onValue(dbActiveRef.current, handleStatusChanges);
      const unsubscribe = onValue(dbGameRef.current, handleDatabaseChanges);

      return () => {
        unsubscribe();
        unsubscribeStatus();
        const playerKey = whichPlayerRef.current === 1 ? "player1" : "player2";
        update(dbActiveRef.current, { [playerKey]: false }).catch((error) => {
          console.error(`Error updating ${playerKey} active status:`, error);
        });
      };
    }
  }, [gameId, userId]);

  const handleActiveStatus = (activeData) => {
    if (activeData && activeData !== prevActiveData) {
      prevActiveData = activeData;
      if (whichPlayerRef.current === 1) {
        setActive(activeData.player2 || false);
      } else {
        setActive(activeData.player1 || false);
      }
    }
  };

  const handleStatusChanges = (snapshot) => {
    handleActiveStatus(snapshot.val());
  };

  const handleDatabaseChanges = (snapshot) => {
    const data = snapshot.val();
    const dataTurn = data.turn;
    const dataGrid = data.grid;
    const dataSelected = data.selected;
    const parsedGridData = Array(config.cells).fill(null);
    const dataMessage = data.message;

    if (dataMessage && whichPlayerRef.current) {
      if (dataMessage.sender !== whichPlayerRef.current) {
        setMessage(dataMessage?.value);
        setVisible(true);
        Animated.timing(animation, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          setTimeout(() => {
            Animated.timing(animation, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }).start(() => setVisible(false));
            set(dbMessageRef.current, { sender: 0, value: "" }).catch((error) => {
              console.error("Error updating game index data:", error);
            });
          }, 2000);
        });
      }
    }

    setCurrentPlayer(dataTurn);

    // Trigger opponent animation when they make a move
    if (dataSelected !== null && dataSelected !== undefined && whichPlayerRef.current) {
      const movedPlayer = dataTurn === 1 ? 2 : 1; // whoever just moved
      if (movedPlayer !== whichPlayerRef.current && dataSelected !== selectedIndex) {
        const opponentKey = movedPlayer === 1 ? "player1" : "player2";
        const opponentAnimId = data.animations?.[opponentKey] || "pulse";
        const opponentShape = data.gameType === "strategist" && data.shapeOrder?.[opponentKey]
          ? getCurrentShape((data.moveCount?.[opponentKey] || 1) - 1, data.shapeOrder[opponentKey])
          : "classic";
        const { playerIndices, redIndices } = getShapeIndices(dataSelected, config.size, opponentShape);
        triggerCellAnimation([dataSelected, ...playerIndices, ...redIndices], opponentAnimId);
      }
    }

    // Sync strategist state from DB
    if (data.moveCount) setMoveCount(data.moveCount);
    if (data.shapeOrder) setShapeOrder(data.shapeOrder);

    if (!dataGrid) {
      updatePlayerScores(null);
      setSelectedIndex(null);
      setGridData(parsedGridData);
    } else {
      setSelectedIndex(dataSelected);
      Object.entries(dataGrid).forEach(([key, value]) => {
        const index = parseInt(key, 10);
        if (!isNaN(index) && index >= 0 && index < config.cells) {
          parsedGridData[index] = value;
        }
      });
      setGridData(parsedGridData);
      updatePlayerScores(parsedGridData);
    }
  };

  const updateTurn = (data) => {
    set(dbTurnRef.current, data).catch((error) => {
      console.error("Error updating turn data:", error);
    });
  };

  const updateIndexData = (data) => {
    set(dbIndexRef.current, data).catch((error) => {
      console.error("Error updating game index data:", error);
    });
  };

  const updateGridData = (data) => {
    set(dbGridRef.current, data).catch((error) => {
      console.error("Error updating grid data:", error);
    });
  };

  // Player 2 picks their starting shape (Strategist only)
  const handleShapePick = (startIndex) => {
    const order = generateShapeOrder(startIndex);
    const shapeOrderRef = royRef(`/games/${gameId}/shapeOrder/player2`);
    set(shapeOrderRef, order).catch((error) => {
      console.error("Error setting player2 shape order:", error);
    });
    setShapeOrder((prev) => ({ ...prev, player2: order }));
    setShowShapePicker(false);
  };

  const handlePressBox = async (index) => {
    if (whichPlayerRef.current === currentPlayer) {
      // For strategist: block this player's moves until THEY have picked their shapes
      const playerKey = whichPlayerRef.current === 1 ? "player1" : "player2";
      if (isStrategist && shapeOrder && !shapeOrder[playerKey]) {
        return;
      }

      setSelectedIndex(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Determine shape for this move
      let shapeName = "classic";
      if (isStrategist && shapeOrder && shapeOrder[playerKey]) {
        shapeName = getCurrentShape(moveCount[playerKey] || 0, shapeOrder[playerKey]);
      }

      const updatedGridData = applyMove(gridData, index, whichPlayerRef.current, config.size, shapeName);

      // Trigger move animation on affected cells
      const { playerIndices, redIndices } = getShapeIndices(index, config.size, shapeName);
      triggerCellAnimation([index, ...playerIndices, ...redIndices], myAnimationId);

      // Update move count for strategist
      if (isStrategist) {
        const newMoveCount = { ...moveCount, [playerKey]: (moveCount[playerKey] || 0) + 1 };
        const moveCountRef = royRef(`/games/${gameId}/moveCount`);
        set(moveCountRef, newMoveCount).catch((error) => {
          console.error("Error updating move count:", error);
        });
      }

      updateGridData(updatedGridData);
      updateIndexData(index);
      updateTurn(currentPlayer === 1 ? 2 : 1);
    }
  };

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowModal(false);
    updateTurn(1);
    updateGridData(null);
    if (isStrategist) {
      const moveCountRef = royRef(`/games/${gameId}/moveCount`);
      set(moveCountRef, { player1: 0, player2: 0 }).catch((error) => {
        console.error("Error resetting move count:", error);
      });
    }
  };

  // Load animation preference from AsyncStorage (persists across games)
  useEffect(() => {
    AsyncStorage.getItem("roy_move_animation").then((saved) => {
      if (saved) setMyAnimationId(saved);
    });
  }, []);

  // Write animation preference to Firebase for the current game
  const writeAnimationToGame = (animId) => {
    if (!gameId || !whichPlayerRef.current) return;
    const playerKey = whichPlayerRef.current === 1 ? "player1" : "player2";
    const animRef = royRef(`/games/${gameId}/animations/${playerKey}`);
    set(animRef, animId).catch(() => {});
  };

  const selectAnimation = (animId) => {
    setMyAnimationId(animId);
    AsyncStorage.setItem("roy_move_animation", animId).catch(() => {});
    writeAnimationToGame(animId);
  };

  // Get or create an Animated.Value for a cell index
  const getCellAnim = (idx) => {
    if (!cellAnimValues.current[idx]) {
      cellAnimValues.current[idx] = new Animated.Value(0);
    }
    return cellAnimValues.current[idx];
  };

  // Trigger cell animation for affected indices — each animation type has distinct timing
  const triggerCellAnimation = (indices, animId) => {
    const anim = getAnimation(animId);
    if (anim.id === "none") return;

    // Store animation type per cell so getCellAnimStyle uses correct interpolation
    indices.forEach((idx) => {
      cellAnimTypes.current[idx] = animId;
    });

    const centerIdx = indices[0]; // the tapped cell

    const anims = indices.map((idx, i) => {
      const val = getCellAnim(idx);
      val.setValue(0);

      if (animId === "electricity") {
        // Rapid flicker: 3 quick flashes
        return Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 40, useNativeDriver: true }),
          Animated.timing(val, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 40, useNativeDriver: true }),
          Animated.timing(val, { toValue: 1, duration: 50, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 120, useNativeDriver: true }),
        ]);
      } else if (animId === "pixel_explosion") {
        // Pop out big then shrink — staggered per cell
        return Animated.sequence([
          Animated.delay(i * 30),
          Animated.timing(val, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]);
      } else if (animId === "shockwave") {
        // Ripple outward from center — staggered by distance
        const delay = idx === centerIdx ? 0 : 80 + i * 40;
        return Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]);
      } else if (animId === "slam") {
        // Slam: scale up big then snap back fast
        return Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 80, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]);
      } else if (animId === "wave") {
        // Left-to-right wave: stagger each cell by index order
        return Animated.sequence([
          Animated.delay(i * 60),
          Animated.timing(val, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]);
      } else if (animId === "ripple") {
        // Ripple outward from tapped cell
        const delay = idx === centerIdx ? 0 : 50 + i * 35;
        return Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]);
      } else {
        // pulse (default)
        return Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]);
      }
    });
    Animated.parallel(anims).start();
  };

  const getCellAnimStyle = (index) => {
    const val = cellAnimValues.current[index];
    if (!val) return {};
    const animType = cellAnimTypes.current[index];
    if (!animType) return {};

    if (animType === "electricity") {
      return {
        opacity: val.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] }),
        transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
      };
    } else if (animType === "pixel_explosion") {
      return {
        transform: [{ scale: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.6, 0.9] }) }],
        opacity: val.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 1, 0.8] }),
      };
    } else if (animType === "shockwave") {
      return {
        transform: [{ scale: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.4, 1] }) }],
        opacity: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }),
      };
    } else if (animType === "slam") {
      return {
        transform: [{ scale: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.5, 1] }) }],
      };
    } else if (animType === "wave") {
      return {
        transform: [
          { translateY: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) },
          { scale: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1] }) },
        ],
      };
    } else if (animType === "ripple") {
      return {
        transform: [{ scale: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.3, 1] }) }],
        opacity: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.6, 1] }),
      };
    }
    // pulse (default)
    return {
      transform: [{ scale: val.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
      opacity: val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.7, 1] }),
    };
  };

  // Get shape info for the HUD
  const getMyShapeInfo = () => {
    if (!isStrategist || !shapeOrder) return null;
    const playerKey = whichPlayerRef.current === 1 ? "player1" : "player2";
    const order = shapeOrder[playerKey];
    if (!order) return null;
    const myCount = moveCount[playerKey] || 0;
    return {
      current: getCurrentShape(myCount, order),
      next: getNextShape(myCount, order),
    };
  };

  const getOpponentShapeInfo = () => {
    if (!isStrategist || !shapeOrder) return null;
    const opponentKey = whichPlayerRef.current === 1 ? "player2" : "player1";
    const order = shapeOrder[opponentKey];
    if (!order) return null;
    const oppCount = moveCount[opponentKey] || 0;
    // You see opponent's last-played shape (their current position - 1) and their next
    const lastPlayed = oppCount > 0 ? getCurrentShape(oppCount - 1, order) : null;
    const next = getCurrentShape(oppCount, order);
    return { lastPlayed, next };
  };

  const myShapes = getMyShapeInfo();
  const opponentShapes = getOpponentShapeInfo();

  const renderBox = (index) => {
    const boxColor = getCellColor(gridData[index]);
    const handlePress = () => handlePressBox(index);
    return (
      <TouchableOpacity key={index} onPress={handlePress}>
        <Animated.View
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
            getCellAnimStyle(index),
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
      {active && (
        <View style={styles.activeStatusIndicatorContainer}>
          <Text style={styles.activeStatusIndicator}>Live</Text>
        </View>
      )}

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={theme.containerBg ? "white" : "black"} />
      </TouchableOpacity>

      <ActionMenu
        onSendEmote={handleTrashTalk}
        onOpenEmoteStore={() => setShowEmoteStore(true)}
        ownedEmotePacks={ownedEmotePacks}
        currentThemeId={themeId}
        onSelectTheme={selectTheme}
        ownedThemes={ownedThemes}
        currentAnimId={myAnimationId}
        onSelectAnimation={selectAnimation}
        ownedAnimations={ownedAnimations}
        iconColor={theme.containerBg ? "white" : "black"}
      />
      <ResetButton handleReset={handleReset} />
      {visible && (
        <Animated.Text style={[styles.trashTalk, animatedStyle]}>
          {message}
        </Animated.Text>
      )}
      <Text style={[styles.title, { fontSize: boardSize === "15x15" ? titleSize - 4 : titleSize }, theme.containerBg && { color: "white" }]}>
        {gameName}
      </Text>
      <View style={styles.scoreboardContainer}>
        <Scoreboard
          player1={player1}
          player2={player2}
          player1Score={player1Score}
          player2Score={player2Score}
          currentPlayer={currentPlayer}
          whichPlayer={whichPlayerRef.current}
        />
      </View>

      {/* Strategist shape HUD */}
      {isStrategist && myShapes && (
        <View style={styles.shapeHudContainer}>
          <View style={styles.shapeHudSection}>
            {opponentShapes && opponentShapes.lastPlayed && (
              <ShapePreview shapeName={opponentShapes.lastPlayed} label="OPP LAST" />
            )}
            {opponentShapes && (
              <ShapePreview shapeName={opponentShapes.next} label="OPP NEXT" />
            )}
          </View>
          <View style={styles.shapeHudSection}>
            <ShapePreview shapeName={myShapes.current} label="CURRENT" size="large" />
            <ShapePreview shapeName={myShapes.next} label="NEXT" />
          </View>
        </View>
      )}

      <View style={{ marginBottom: 10 }}>{renderGrid()}</View>

      {showModal && (
        <Modal transparent visible={showModal}>
          <GameOverModal
            handleReset={handleReset}
            player1Score={player1Score}
            player2Score={player2Score}
          />
        </Modal>
      )}

      <EmoteStore
        visible={showEmoteStore}
        onClose={() => setShowEmoteStore(false)}
        ownedPacks={ownedEmotePacks}
      />

      {/* Player 2 shape picker (Strategist only) */}
      {showShapePicker && (
        <Modal transparent visible={showShapePicker}>
          <View style={styles.shapePickerOverlay}>
            <View style={styles.shapePickerContainer}>
              <Text style={styles.shapePickerTitle}>Pick Your Starting Shape</Text>
              <Text style={styles.shapePickerHint}>
                The other 2 will be randomized in your rotation.
              </Text>
              <View style={styles.shapePickerRow}>
                {SHAPE_NAMES.map((shape, idx) => (
                  <TouchableOpacity
                    key={shape}
                    style={styles.shapePickerOption}
                    onPress={() => handleShapePick(idx)}
                  >
                    <ShapePreview shapeName={shape} size="large" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    position: "absolute",
    top: 15,
    left: 10,
    padding: 8,
    zIndex: 11,
  },
  outerContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 10,
  },
  scoreboardContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginHorizontal: 10,
  },
  activeStatusIndicatorContainer: {
    position: "absolute",
    top: 65,
    right: 20,
    backgroundColor: "lightgreen",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  activeStatusIndicator: {
    color: "black",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    fontFamily: "PressStart2P-Regular",
  },
  trashTalk: {
    fontSize: 48,
    position: "absolute",
    top: 0,
  },
  row: {
    flexDirection: "row",
  },
  title: {
    paddingBottom: 10,
    marginBottom: 5,
    fontWeight: "bold",
    fontSize: 24,
    fontFamily: "PressStart2P-Regular",
    color: "black",
  },
  box: {
    borderWidth: 1,
    borderColor: "black",
    marginHorizontal: 2,
  },
  // Strategist shape HUD
  shapeHudContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  shapeHudSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // Shape picker modal (player 2 first open)
  shapePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  shapePickerContainer: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 15,
    padding: 24,
    alignItems: "center",
  },
  shapePickerTitle: {
    fontSize: 12,
    fontFamily: "PressStart2P-Regular",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  shapePickerHint: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 14,
  },
  shapePickerRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  shapePickerOption: {
    padding: 10,
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 8,
  },
});

export default Grid;
