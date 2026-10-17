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
import { getAnimationList } from "../utils/animationData";

const AnimationSelector = ({ visible, onClose, currentAnimId, onSelect, ownedAnimations = {} }) => {
  const animations = getAnimationList();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>

          <Text style={styles.title}>Move Effects</Text>
          <Text style={styles.subtitle}>
            Your opponent sees your effect too!
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {animations.map((anim) => {
              const isOwned = anim.free || ownedAnimations[anim.id];
              const isActive = currentAnimId === anim.id;

              return (
                <TouchableOpacity
                  key={anim.id}
                  style={[styles.animCard, isActive && styles.animCardActive]}
                  onPress={() => {
                    if (isOwned) onSelect(anim.id);
                  }}
                  disabled={!isOwned}
                >
                  <View style={styles.animInfo}>
                    <View>
                      <Text style={styles.animName}>{anim.name}</Text>
                      <Text style={styles.animDesc}>{anim.description}</Text>
                    </View>
                    {isActive && (
                      <Ionicons name="checkmark-circle" size={18} color="darkgreen" />
                    )}
                    {!isOwned && (
                      <Text style={styles.animPrice}>{anim.price}</Text>
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
  animCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  animCardActive: {
    borderColor: "darkgreen",
    backgroundColor: "#e8f5e9",
  },
  animInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  animName: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#333",
  },
  animDesc: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginTop: 3,
  },
  animPrice: {
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

export default AnimationSelector;
