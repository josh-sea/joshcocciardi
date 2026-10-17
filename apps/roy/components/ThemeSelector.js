import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getThemeList } from "../utils/themeData";

const ThemeSelector = ({ visible, onClose, currentThemeId, onSelect, ownedThemes = {} }) => {
  const themes = getThemeList();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>

          <Text style={styles.title}>Board Themes</Text>
          <Text style={styles.subtitle}>
            Choose your board style
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {themes.map((theme) => {
              const isOwned = theme.free || ownedThemes[theme.id];
              const isActive = currentThemeId === theme.id;

              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[styles.themeCard, isActive && styles.themeCardActive]}
                  onPress={() => {
                    if (isOwned) onSelect(theme.id);
                  }}
                  disabled={!isOwned}
                >
                  {/* Color preview strip */}
                  <View style={styles.previewRow}>
                    <View
                      style={[
                        styles.previewCell,
                        {
                          backgroundColor: theme.boardBg || "#fff",
                          borderColor: theme.cellBorderColor,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewCell,
                        {
                          backgroundColor: theme.containerBg || "#f5f5f5",
                          borderColor: theme.cellBorderColor,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.previewCell,
                        {
                          backgroundColor: theme.boardBg || "#fff",
                          borderColor: theme.selectedBorderColor,
                          borderWidth: 3,
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.themeInfo}>
                    <Text style={styles.themeName}>{theme.name}</Text>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={18} color="darkgreen" />
                    )}
                    {!isOwned && (
                      <Text style={styles.themePrice}>{theme.price}</Text>
                    )}
                  </View>

                  {!isOwned && (
                    <TouchableOpacity style={styles.unlockButton}>
                      <Text style={styles.unlockButtonText}>Unlock</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
  themeCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  themeCardActive: {
    borderColor: "darkgreen",
    backgroundColor: "#e8f5e9",
  },
  previewRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  previewCell: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderRadius: 4,
  },
  themeInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  themeName: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#333",
  },
  themePrice: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "darkgreen",
  },
  unlockButton: {
    backgroundColor: "darkgreen",
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  unlockButtonText: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "white",
    fontWeight: "bold",
  },
});

export default ThemeSelector;
