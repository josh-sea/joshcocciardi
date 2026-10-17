import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EMOTE_PACKS } from "../utils/emoteData";

const EmoteStore = ({ visible, onClose, ownedPacks = {} }) => {
  const packs = Object.values(EMOTE_PACKS);

  const renderPack = ({ item }) => {
    const owned = ownedPacks[item.id];
    return (
      <View style={styles.packCard}>
        <View style={styles.packHeader}>
          <Text style={styles.packName}>{item.name}</Text>
          {owned ? (
            <Text style={styles.ownedBadge}>OWNED</Text>
          ) : (
            <Text style={styles.packPrice}>{item.price}</Text>
          )}
        </View>
        <View style={styles.emoteGrid}>
          {item.emotes.map((emote, idx) => (
            <Text key={idx} style={styles.emotePreview}>
              {emote}
            </Text>
          ))}
        </View>
        {!owned && (
          <TouchableOpacity style={styles.buyButton}>
            <Text style={styles.buyButtonText}>Unlock</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>

          <Text style={styles.title}>Emote Store</Text>
          <Text style={styles.subtitle}>
            Unlock new emotes for trash talk!
          </Text>

          <FlatList
            data={packs}
            keyExtractor={(item) => item.id}
            renderItem={renderPack}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "85%",
    maxHeight: "80%",
    backgroundColor: "white",
    borderRadius: 15,
    padding: 16,
  },
  closeButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 1,
    padding: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: "PressStart2P-Regular",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    textAlign: "center",
    marginBottom: 16,
  },
  packCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  packHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  packName: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#333",
  },
  packPrice: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "darkgreen",
  },
  ownedBadge: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "white",
    backgroundColor: "darkgreen",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  emoteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  emotePreview: {
    fontSize: 22,
  },
  buyButton: {
    backgroundColor: "darkgreen",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  buyButtonText: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "white",
    fontWeight: "bold",
  },
});

export default EmoteStore;
