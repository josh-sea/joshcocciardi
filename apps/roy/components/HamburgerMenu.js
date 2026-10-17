import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Text,
  Dimensions,
} from 'react-native';
import alert from "../utils/alert";
import { Ionicons } from '@expo/vector-icons';
import { auth } from "../admin/firebaseConfig";
import { useNavigation } from "@react-navigation/native";

const { height } = Dimensions.get('window');
const isSmallScreen = height < 667;

const HamburgerMenu = ({ onNewGame, userId }) => {
  const [menuVisible, setMenuVisible] = useState(false);
  const navigation = useNavigation();

  const handleLogout = () => {
    auth
      .signOut()
      // The session listener in App swaps back to the login screens.
      .catch((error) => {
        alert('Logout Failed', error.message);
      });
    setMenuVisible(false);
  };

  const handleNewGame = () => {
    setMenuVisible(false);
    onNewGame();
  };

  const handleFriends = () => {
    setMenuVisible(false);
    navigation.navigate('Friends');
  };

  const handleProfile = () => {
    setMenuVisible(false);
    navigation.navigate('Profile');
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setMenuVisible(true)}
      >
        <Ionicons name="menu" size={24} color="black" />
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleNewGame}
            >
              <Ionicons name="add-circle-outline" size={20} color="black" />
              <Text style={styles.menuText}>New Game</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleFriends}
            >
              <Ionicons name="people-outline" size={20} color="black" />
              <Text style={styles.menuText}>Friends</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleProfile}
            >
              <Ionicons name="person-outline" size={20} color="black" />
              <Text style={styles.menuText}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={20} color="black" />
              <Text style={styles.menuText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  menuButton: {
    padding: isSmallScreen ? 8 : 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    position: 'absolute',
    top: isSmallScreen ? 40 : 60,
    right: 10,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuText: {
    marginLeft: 8,
    fontSize: isSmallScreen ? 14 : 16,
    fontFamily: "PressStart2P-Regular",
  },
});

export default HamburgerMenu;
