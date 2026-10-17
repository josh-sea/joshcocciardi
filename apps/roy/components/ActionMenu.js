import React, { useState, useRef } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FREE_EMOTES, EMOTE_PACKS } from "../utils/emoteData";
import { getThemeList } from "../utils/themeData";
import { getAnimationList } from "../utils/animationData";

const TABS = [
  { key: "emotes", icon: "chatbubble-ellipses", label: "Emotes" },
  { key: "themes", icon: "color-palette", label: "Themes" },
  { key: "effects", icon: "flash", label: "Effects" },
];

const ActionMenu = ({
  onSendEmote,
  onOpenEmoteStore,
  ownedEmotePacks = {},
  currentThemeId,
  onSelectTheme,
  ownedThemes = {},
  currentAnimId,
  onSelectAnimation,
  ownedAnimations = {},
  iconColor = "black",
}) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("emotes");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    if (open) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setOpen(false));
    } else {
      setOpen(true);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleEmoji = (emoji) => {
    toggle();
    onSendEmote(emoji);
  };

  const ownedPackIds = Object.keys(EMOTE_PACKS).filter(
    (id) => ownedEmotePacks[id]
  );

  const themes = getThemeList();
  const animations = getAnimationList();

  const panelTranslate = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-320, 0],
  });

  const renderEmotesTab = () => (
    <>
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

      {onOpenEmoteStore && (
        <TouchableOpacity
          style={styles.storeLink}
          onPress={() => {
            toggle();
            onOpenEmoteStore();
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color="darkgreen" />
          <Text style={styles.storeLinkText}>Get More Emotes</Text>
        </TouchableOpacity>
      )}
    </>
  );

  const renderThemesTab = () => (
    <>
      {themes.map((t) => {
        const isOwned = t.free || ownedThemes[t.id];
        const isActive = currentThemeId === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={[styles.optionCard, isActive && styles.optionCardActive]}
            onPress={() => {
              if (isOwned) onSelectTheme(t.id);
            }}
            disabled={!isOwned}
          >
            <View style={styles.previewRow}>
              <View
                style={[
                  styles.previewCell,
                  { backgroundColor: t.boardBg || "#fff", borderColor: t.cellBorderColor },
                ]}
              />
              <View
                style={[
                  styles.previewCell,
                  { backgroundColor: t.containerBg || "#f5f5f5", borderColor: t.cellBorderColor },
                ]}
              />
              <View
                style={[
                  styles.previewCell,
                  { backgroundColor: t.boardBg || "#fff", borderColor: t.selectedBorderColor, borderWidth: 3 },
                ]}
              />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionName}>{t.name}</Text>
              {isActive && <Ionicons name="checkmark-circle" size={16} color="darkgreen" />}
              {!isOwned && <Text style={styles.optionPrice}>{t.price}</Text>}
            </View>
            {!isOwned && (
              <TouchableOpacity style={styles.unlockButton}>
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderEffectsTab = () => (
    <>
      <Text style={styles.effectSubtitle}>Your opponent sees your effect!</Text>
      {animations.map((a) => {
        const isOwned = a.free || ownedAnimations[a.id];
        const isActive = currentAnimId === a.id;
        return (
          <TouchableOpacity
            key={a.id}
            style={[styles.optionCard, isActive && styles.optionCardActive]}
            onPress={() => {
              if (isOwned) onSelectAnimation(a.id);
            }}
            disabled={!isOwned}
          >
            <View style={styles.optionInfo}>
              <View>
                <Text style={styles.optionName}>{a.name}</Text>
                <Text style={styles.optionDesc}>{a.description}</Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={16} color="darkgreen" />}
              {!isOwned && <Text style={styles.optionPrice}>{a.price}</Text>}
            </View>
            {!isOwned && (
              <TouchableOpacity style={styles.unlockButton}>
                <Text style={styles.unlockText}>Unlock</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Toggle button */}
      <TouchableOpacity style={styles.toggleButton} onPress={toggle}>
        <Ionicons
          name={open ? "close" : "ellipsis-horizontal"}
          size={22}
          color={iconColor}
        />
      </TouchableOpacity>

      {/* Sliding panel */}
      {open && (
        <Animated.View
          style={[
            styles.panel,
            { transform: [{ translateX: panelTranslate }] },
          ]}
        >
          {/* Tab bar */}
          <View style={styles.tabBar}>
            {TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Ionicons
                  name={activeTab === tab.key ? tab.icon : `${tab.icon}-outline`}
                  size={18}
                  color={activeTab === tab.key ? "darkgreen" : "#888"}
                />
                <Text
                  style={[
                    styles.tabLabel,
                    activeTab === tab.key && styles.tabLabelActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab content */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.tabContent}
          >
            {activeTab === "emotes" && renderEmotesTab()}
            {activeTab === "themes" && renderThemesTab()}
            {activeTab === "effects" && renderEffectsTab()}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 55,
    left: 10,
    zIndex: 10,
  },
  toggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  panel: {
    position: "absolute",
    top: 42,
    left: 0,
    width: 280,
    maxHeight: 380,
    backgroundColor: "white",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
    overflow: "hidden",
  },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "darkgreen",
  },
  tabLabel: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
  },
  tabLabelActive: {
    color: "darkgreen",
  },
  tabContent: {
    padding: 10,
    maxHeight: 330,
  },
  // Emotes
  sectionLabel: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginBottom: 6,
    marginTop: 4,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  emojiCell: {
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 22,
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
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "darkgreen",
  },
  // Themes & Effects shared
  optionCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  optionCardActive: {
    borderColor: "darkgreen",
    backgroundColor: "#e8f5e9",
  },
  previewRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 6,
  },
  previewCell: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 3,
  },
  optionInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  optionName: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "#333",
  },
  optionDesc: {
    fontSize: 6,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginTop: 2,
  },
  optionPrice: {
    fontSize: 8,
    fontFamily: "PressStart2P-Regular",
    color: "darkgreen",
  },
  effectSubtitle: {
    fontSize: 6,
    fontFamily: "PressStart2P-Regular",
    color: "#999",
    textAlign: "center",
    marginBottom: 8,
  },
  unlockButton: {
    backgroundColor: "darkgreen",
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 6,
  },
  unlockText: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "white",
    fontWeight: "bold",
  },
});

export default ActionMenu;
