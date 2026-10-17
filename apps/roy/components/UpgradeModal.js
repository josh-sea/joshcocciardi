import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";

const UpgradeModal = ({ onClose }) => {
  const handleUnlock = () => {
    // Placeholder — IAP purchase flow will be wired in Phase 5
    // For now this just closes the modal
    onClose();
  };

  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Game Limit Reached</Text>
          <Text style={styles.description}>
            Free accounts can have up to 3 active games.
          </Text>
          <Text style={styles.description}>
            Unlock unlimited games + Deathmatch 5x5 mode!
          </Text>

          <TouchableOpacity style={styles.unlockButton} onPress={handleUnlock}>
            <Text style={styles.unlockButtonText}>Unlock - $3.99</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.restoreButton} onPress={onClose}>
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose}>
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "85%",
    backgroundColor: "white",
    borderRadius: 15,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 14,
    fontFamily: "PressStart2P-Regular",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  description: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#555",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 18,
  },
  unlockButton: {
    marginTop: 16,
    width: "100%",
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "darkgreen",
    borderRadius: 15,
  },
  unlockButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
  restoreButton: {
    marginTop: 12,
    padding: 8,
  },
  restoreButtonText: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#007AFF",
    textAlign: "center",
  },
  dismissText: {
    marginTop: 8,
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#999",
  },
});

export default UpgradeModal;
