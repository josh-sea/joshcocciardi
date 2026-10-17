import React, { useEffect, useState } from "react";
import {
  View,
  TextInput,
  Button,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Text,
  FlatList,
  ScrollView,
} from "react-native";
import { database } from "../admin/firebaseConfig";
import { Ionicons } from "@expo/vector-icons";
import { ref, set, push, get } from "firebase/database";
import ShapePreview from "./ShapePreview";
import { SHAPE_NAMES, generateShapeOrder } from "../utils/gameEngine";

const CreateGameForm = ({ userId, onClose, deathmatch = false, strategist = false }) => {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [opponent, setOpponent] = useState(null);
  const [friends, setFriends] = useState([]);
  const [filteredFriends, setFilteredFriends] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  const [boardSize, setBoardSize] = useState("10x10");
  const [startingShape, setStartingShape] = useState(0); // index into SHAPE_NAMES

  useEffect(() => {
    const loadFriendsAndUser = async () => {
      try {
        const userSnap = await get(ref(database, `/users/${userId}`));
        if (!userSnap.exists()) return;
        setCurrentUsername(userSnap.val().username);

        const friendsNode = userSnap.val().friends;
        if (!friendsNode) return;

        const friendIds = Object.keys(friendsNode);
        const profiles = await Promise.all(
          friendIds.map(async (fid) => {
            const snap = await get(ref(database, `/users/${fid}`));
            return snap.exists() ? { id: fid, username: snap.val().username } : null;
          })
        );
        const valid = profiles.filter(Boolean);
        setFriends(valid);
        setFilteredFriends(valid);
      } catch (error) {
        console.error("Error loading friends:", error);
      }
    };
    loadFriendsAndUser();
  }, [userId]);

  useEffect(() => {
    const term = search.toLowerCase();
    setFilteredFriends(
      term ? friends.filter((f) => f.username.toLowerCase().includes(term)) : friends
    );
  }, [search, friends]);

  const handleSearch = () => {
    if (filteredFriends.length > 0) {
      setModalVisible(true);
    }
  };

  const handleSelectOpponent = (id, username) => {
    setOpponent(id);
    setSearch(username);
    setModalVisible(false);
  };

  const handleSubmit = () => {
    if (opponent) {
      try {
        const gamesRef = ref(database, "/games");
        const newGameRef = push(gamesRef);
        const gameId = newGameRef.key;
        const gameData = {
          name,
          player1: userId,
          player2: opponent,
          grid: "",
          turn: 1,
          boardSize,
          active: { player1: false, player2: false },
          players: {
            player1: {
              active: false,
              username: currentUsername,
            },
            player2: {
              active: false,
              username: search,
            },
          },
        };

        // Add Strategist-specific data
        if (boardSize === "15x15") {
          gameData.gameType = "strategist";
          gameData.shapes = SHAPE_NAMES;
          gameData.shapeOrder = {
            player1: generateShapeOrder(startingShape),
            // player2 picks their start when they first open the game
            player2: null,
          };
          gameData.moveCount = { player1: 0, player2: 0 };
          gameData.creatorId = userId;
        }

        set(ref(database, `/games/${gameId}`), gameData);
        setName("");
        setSearch("");
        setOpponent(null);
        setBoardSize("10x10");
        setStartingShape(0);
        onClose();
      } catch (error) {
        console.error("Error creating game:", error);
      }
    }
  };

  const isStrategist = boardSize === "15x15";

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#888" />
        </TouchableOpacity>

        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Create New Game</Text>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.input}
              value={name}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={setName}
              placeholder="Game Name"
            />
          </View>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.input}
              value={search}
              autoCorrect={false}
              autoCapitalize="none"
              onChangeText={setSearch}
              placeholder="Search friends"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity onPress={handleSearch}>
              <Ionicons name="search" size={24} color="black" />
            </TouchableOpacity>
          </View>

          {friends.length === 0 && (
            <Text style={styles.noFriendsText}>
              Add friends in the Friends menu to invite them to a game.
            </Text>
          )}

          <Text style={styles.sectionLabel}>Game Mode</Text>
          <View style={styles.boardSizeContainer}>
            <TouchableOpacity
              style={[styles.sizeOption, boardSize === "10x10" && styles.sizeOptionActive]}
              onPress={() => setBoardSize("10x10")}
            >
              <Text style={[styles.sizeOptionText, boardSize === "10x10" && styles.sizeOptionTextActive]}>
                Classic 10x10
              </Text>
            </TouchableOpacity>

            {deathmatch && (
              <TouchableOpacity
                style={[styles.sizeOption, boardSize === "5x5" && styles.sizeOptionActive]}
                onPress={() => setBoardSize("5x5")}
              >
                <Text style={[styles.sizeOptionText, boardSize === "5x5" && styles.sizeOptionTextActive]}>
                  Deathmatch 5x5
                </Text>
              </TouchableOpacity>
            )}

            {strategist && (
              <TouchableOpacity
                style={[styles.sizeOption, boardSize === "15x15" && styles.sizeOptionActive]}
                onPress={() => setBoardSize("15x15")}
              >
                <Text style={[styles.sizeOptionText, boardSize === "15x15" && styles.sizeOptionTextActive]}>
                  Strategist 15x15
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {isStrategist && (
            <View style={styles.shapePickerSection}>
              <Text style={styles.sectionLabel}>Pick Your Starting Shape</Text>
              <Text style={styles.shapeHint}>
                The other 2 shapes are randomized in your rotation.
              </Text>
              <View style={styles.shapePickerRow}>
                {SHAPE_NAMES.map((shape, idx) => (
                  <TouchableOpacity
                    key={shape}
                    style={[
                      styles.shapePickerOption,
                      startingShape === idx && styles.shapePickerOptionActive,
                    ]}
                    onPress={() => setStartingShape(idx)}
                  >
                    <ShapePreview shapeName={shape} size="large" />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!opponent || !name) && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!opponent || !name}
          >
            <Text style={styles.buttonText}>Create Game</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={modalVisible} animationType="slide" transparent={true}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <FlatList
                data={filteredFriends}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.modalItem}
                    onPress={() => handleSelectOpponent(item.id, item.username)}
                  >
                    <Text style={styles.modalItemText}>{item.username}</Text>
                  </TouchableOpacity>
                )}
              />
              <Button title="Cancel" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 14,
    textAlign: "center",
    fontWeight: "bold",
    marginBottom: 16,
    fontFamily: "PressStart2P-Regular",
  },
  formContainer: {
    width: "85%",
    maxHeight: "80%",
    padding: 16,
    backgroundColor: "white",
    borderRadius: 15,
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 1,
    padding: 4,
  },
  button: {
    marginTop: 16,
    marginBottom: 8,
    height: 40,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
  },
  buttonDisabled: {
    backgroundColor: "#aaa",
  },
  buttonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
  noFriendsText: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderColor: "lightgray",
    borderRadius: 8,
    width: "100%",
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: "white",
    paddingHorizontal: 8,
    fontSize: 12,
    fontFamily: "PressStart2P-Regular",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    width: "80%",
  },
  modalItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    height: 40,
    width: "100%",
    borderColor: "lightgray",
    paddingHorizontal: 8,
  },
  modalItemText: {
    fontFamily: "PressStart2P-Regular",
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#555",
    marginBottom: 8,
  },
  boardSizeContainer: {
    width: "100%",
    marginBottom: 8,
  },
  sizeOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    marginBottom: 6,
    alignItems: "center",
  },
  sizeOptionActive: {
    borderColor: "darkgreen",
    backgroundColor: "#e8f5e9",
  },
  sizeOptionText: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
  },
  sizeOptionTextActive: {
    color: "darkgreen",
  },
  shapePickerSection: {
    marginTop: 4,
    marginBottom: 4,
  },
  shapeHint: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#999",
    marginBottom: 10,
    lineHeight: 12,
  },
  shapePickerRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  shapePickerOption: {
    padding: 8,
    borderWidth: 2,
    borderColor: "#ddd",
    borderRadius: 8,
    alignItems: "center",
  },
  shapePickerOptionActive: {
    borderColor: "darkgreen",
    backgroundColor: "#e8f5e9",
  },
});

export default CreateGameForm;
