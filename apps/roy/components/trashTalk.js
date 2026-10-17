import React, { useState } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FREE_EMOTES, EMOTE_PACKS } from "../utils/emoteData";

const TrashTalk = ({ onPress, ownedEmotePacks = {}, onOpenStore }) => {
  const [showPanel, setShowPanel] = useState(false);

  const handleEmoji = (emoji) => {
    setShowPanel(false);
    onPress(emoji);
  };

  // Build sections: free emotes + each owned pack
  const ownedPackIds = Object.keys(EMOTE_PACKS).filter(
    (id) => ownedEmotePacks[id]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.chatButton}
        onPress={() => setShowPanel(true)}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={24} color="black" />
      </TouchableOpacity>

      <Modal visible={showPanel} transparent animationType="fade">
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => setShowPanel(false)}
        >
          <View style={styles.panel} onStartShouldSetResponder={() => true}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Free emotes */}
              <Text style={styles.sectionLabel}>Emotes</Text>
              <View style={styles.emojiGrid}>
                {FREE_EMOTES.map((emoji, i) => (
                  <TouchableOpacity
                    key={`free-${i}`}
                    style={styles.emojiCell}
                    onPress={() => handleEmoji(emoji)}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Owned premium packs */}
              {ownedPackIds.map((packId) => {
                const pack = EMOTE_PACKS[packId];
                return (
                  <View key={packId}>
                    <Text style={styles.sectionLabel}>{pack.name}</Text>
                    <View style={styles.emojiGrid}>
                      {pack.emotes.map((emoji, i) => (
                        <TouchableOpacity
                          key={`${packId}-${i}`}
                          style={styles.emojiCell}
                          onPress={() => handleEmoji(emoji)}
                        >
                          <Text style={styles.emoji}>{emoji}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })}

              {/* Store link */}
              {onOpenStore && (
                <TouchableOpacity
                  style={styles.storeLink}
                  onPress={() => {
                    setShowPanel(false);
                    onOpenStore();
                  }}
                >
                  <Ionicons name="add-circle-outline" size={16} color="darkgreen" />
                  <Text style={styles.storeLinkText}>Get More Emotes</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 55,
    left: 10,
    zIndex: 1,
  },
  chatButton: {
    padding: 6,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "flex-start",
    paddingTop: 100,
    paddingHorizontal: 20,
  },
  panel: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    maxHeight: 320,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  sectionLabel: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginBottom: 6,
    marginTop: 4,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 8,
  },
  emojiCell: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 24,
  },
  storeLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    marginTop: 4,
  },
  storeLinkText: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "darkgreen",
  },
});

export default TrashTalk;
