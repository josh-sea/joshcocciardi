import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Dimensions,
  Share,
  Switch,
} from "react-native";
import alert from "../utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { royRef } from "../admin/firebaseConfig";
import { get, update } from "firebase/database";
import { useNavigation } from "@react-navigation/native";
import { useUserId } from "../admin/session";

const { height } = Dimensions.get("window");
const isSmallScreen = height < 667;

const DEFAULT_NOTIF_PREFS = {
  turns: true,
  invites: true,
  emotes: true,
};

const Profile = ({ route }) => {
  const userId = useUserId();
  const navigation = useNavigation();
  const [profile, setProfile] = useState(null);
  const [copied, setCopied] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    get(royRef(`/users/${userId}`)).then((snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setProfile(data);
        if (data.notifications) {
          setNotifPrefs({ ...DEFAULT_NOTIF_PREFS, ...data.notifications });
        }
      }
    });
  }, [userId]);

  const handleCopy = async () => {
    if (!profile?.friendCode) return;
    await Clipboard.setStringAsync(profile.friendCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!profile?.friendCode) return;
    try {
      await Share.share({
        message: `Add me on Roy! My friend code is: ${profile.friendCode}`,
      });
    } catch (e) {
      alert("Error", "Could not share.");
    }
  };

  const toggleNotifPref = (key) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    update(royRef(`/users/${userId}/notifications`), { [key]: !notifPrefs[key] }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.title}>Profile</Text>
        </View>

        {profile && (
          <>
            <View style={styles.card}>
              <Ionicons name="person-circle" size={64} color="#555" style={styles.avatar} />
              <Text style={styles.username}>{profile.username}</Text>

              <View style={styles.divider} />

              <Text style={styles.codeLabel}>Your Friend Code</Text>
              <Text style={styles.friendCode}>{profile.friendCode}</Text>
              <Text style={styles.hint}>
                Share this code so friends can add you
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
                  <Ionicons
                    name={copied ? "checkmark-circle" : "copy-outline"}
                    size={18}
                    color="white"
                  />
                  <Text style={styles.actionText}>{copied ? "Copied!" : "Copy"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.shareButton]} onPress={handleShare}>
                  <Ionicons name="share-social-outline" size={18} color="white" />
                  <Text style={styles.actionText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.notifCard}>
              <Text style={styles.notifTitle}>Notifications</Text>

              <View style={styles.notifRow}>
                <View>
                  <Text style={styles.notifLabel}>Turns</Text>
                  <Text style={styles.notifHint}>When it's your turn</Text>
                </View>
                <Switch
                  value={notifPrefs.turns}
                  onValueChange={() => toggleNotifPref("turns")}
                  trackColor={{ false: "#ddd", true: "#4CAF50" }}
                  thumbColor="white"
                />
              </View>

              <View style={styles.notifRow}>
                <View>
                  <Text style={styles.notifLabel}>Invites</Text>
                  <Text style={styles.notifHint}>Game invitations</Text>
                </View>
                <Switch
                  value={notifPrefs.invites}
                  onValueChange={() => toggleNotifPref("invites")}
                  trackColor={{ false: "#ddd", true: "#4CAF50" }}
                  thumbColor="white"
                />
              </View>

              <View style={[styles.notifRow, { borderBottomWidth: 0 }]}>
                <View>
                  <Text style={styles.notifLabel}>Emotes</Text>
                  <Text style={styles.notifHint}>Trash talk messages</Text>
                </View>
                <Switch
                  value={notifPrefs.emotes}
                  onValueChange={() => toggleNotifPref("emotes")}
                  trackColor={{ false: "#ddd", true: "#4CAF50" }}
                  thumbColor="white"
                />
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    padding: isSmallScreen ? 12 : 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    paddingTop: isSmallScreen ? 8 : 16,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  title: {
    fontSize: isSmallScreen ? 16 : 20,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
  },
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  avatar: {
    marginBottom: 12,
  },
  username: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
    marginBottom: 4,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 20,
  },
  codeLabel: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  friendCode: {
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
    letterSpacing: 4,
    color: "#222",
    marginBottom: 8,
  },
  hint: {
    fontSize: 9,
    fontFamily: "PressStart2P-Regular",
    color: "#aaa",
    textAlign: "center",
    marginBottom: 24,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "darkgreen",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  shareButton: {
    backgroundColor: "#444",
  },
  actionText: {
    color: "white",
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
  },
  // Notification settings
  notifCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  notifTitle: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "PressStart2P-Regular",
    marginBottom: 16,
  },
  notifRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  notifLabel: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#333",
  },
  notifHint: {
    fontSize: 7,
    fontFamily: "PressStart2P-Regular",
    color: "#999",
    marginTop: 3,
  },
});

export default Profile;
