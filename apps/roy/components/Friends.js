import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import alert from "../utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { royRef } from "../admin/firebaseConfig";
import { get, set, remove, onValue } from "firebase/database";
import { useNavigation } from "@react-navigation/native";

const { height } = Dimensions.get("window");
const isSmallScreen = height < 667;

const Friends = ({ route }) => {
  const { userId } = route.params;
  const navigation = useNavigation();
  const [identifier, setIdentifier] = useState("");
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const friendsRef = royRef(`/users/${userId}/friends`);
    const unsubscribe = onValue(friendsRef, async (snapshot) => {
      if (!snapshot.exists()) {
        setFriends([]);
        return;
      }
      const friendIds = Object.keys(snapshot.val());
      const profiles = await Promise.all(
        friendIds.map(async (fid) => {
          const snap = await get(royRef(`/users/${fid}`));
          return snap.exists()
            ? { id: fid, username: snap.val().username, friendCode: snap.val().friendCode }
            : null;
        })
      );
      setFriends(profiles.filter(Boolean));
    });
    return () => unsubscribe();
  }, [userId]);

  const handleAdd = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const usersRef = royRef("/users");
      const snapshot = await get(usersRef);
      if (!snapshot.exists()) {
        alert("Not Found", "No user found with that username or friend code.");
        return;
      }

      let foundId = null;
      let foundUsername = null;
      snapshot.forEach((child) => {
        const val = child.val();
        if (
          val.username?.toLowerCase() === trimmed.toLowerCase() ||
          val.friendCode === trimmed
        ) {
          foundId = child.key;
          foundUsername = val.username;
        }
      });

      if (!foundId) {
        alert("Not Found", "No user found with that username or friend code.");
        return;
      }
      if (foundId === userId) {
        alert("Oops", "You can't add yourself.");
        return;
      }

      const alreadyFriend = friends.some((f) => f.id === foundId);
      if (alreadyFriend) {
        alert("Already Friends", `${foundUsername} is already your friend.`);
        return;
      }

      await set(royRef(`/users/${userId}/friends/${foundId}`), true);
      setIdentifier("");
      alert("Friend Added", `${foundUsername} has been added to your friends.`);
    } catch (e) {
      console.error("Error adding friend:", e);
      alert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (friendId, username) => {
    alert("Remove Friend", `Remove ${username}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => remove(royRef(`/users/${userId}/friends/${friendId}`)),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
          <Text style={styles.title}>Friends</Text>
        </View>

        <View style={styles.addSection}>
          <Text style={styles.label}>Add by username or friend code</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Username or code"
              autoCorrect={false}
              autoCapitalize="none"
              onSubmitEditing={handleAdd}
            />
            <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Ionicons name="person-add" size={20} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {friends.length === 0 ? "No friends yet" : `Friends (${friends.length})`}
        </Text>

        <FlatList
          data={friends}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.friendRow}>
              <Ionicons name="person-circle-outline" size={28} color="#555" />
              <Text style={styles.friendName}>{item.username}</Text>
              <TouchableOpacity
                onPress={() => handleRemove(item.id, item.username)}
                style={styles.removeButton}
              >
                <Ionicons name="close-circle-outline" size={22} color="#c00" />
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.listContent}
        />
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
  addSection: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#555",
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 40,
    borderBottomWidth: 1,
    borderColor: "lightgray",
    paddingHorizontal: 8,
    fontSize: 12,
    fontFamily: "PressStart2P-Regular",
  },
  addButton: {
    marginLeft: 10,
    backgroundColor: "darkgreen",
    borderRadius: 10,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "PressStart2P-Regular",
    color: "#888",
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 20,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  friendName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 12,
    fontFamily: "PressStart2P-Regular",
  },
  removeButton: {
    padding: 4,
  },
});

export default Friends;
